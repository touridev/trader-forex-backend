const axios = require('axios');

// Get current exchange rate (with fallback to approximate rates)
const getExchangeRate = async (pair) => {
  try {
    // Try to get real-time rate from freecurrencyapi.com
    // Note: This requires an API key in production
    const [base, quote] = pair.split('/');
    const response = await axios.get(`https://api.freecurrencyapi.com/v1/latest`, {
      params: {
        base_currency: base,
        currencies: quote,
        apikey: process.env.FREE_CURRENCY_API_KEY || 'fca_live_demo_key' // Use env variable in production
      },
      timeout: 3000
    });
    
    if (response.data && response.data.data && response.data.data[quote]) {
      return response.data.data[quote];
    }
  } catch (err) {
    console.log(`Could not fetch rate for ${pair}, using approximate rate`);
  }
  
  // Fallback to approximate rates
  const approximateRates = {
    'EUR/USD': 1.10,
    'GBP/USD': 1.27,
    'AUD/USD': 0.67,
    'NZD/USD': 0.62,
    'USD/JPY': 149.50,
    'USD/CAD': 1.36,
    'USD/CHF': 0.89,
    'EUR/GBP': 0.87,
    'EUR/JPY': 164.45,
    'GBP/JPY': 189.87,
    'AUD/JPY': 100.17
  };
  
  return approximateRates[pair] || 1.0;
};

// Get pip value for a currency pair in account currency
// Standard calculation: 1 lot = 100,000 units
// For pairs where account currency is the quote: pip value = 10 per lot
// For pairs where account currency is the base: pip value = 10 / exchange rate per lot
// For JPY pairs: pip size is 0.01 instead of 0.0001, but pip value calculation adjusts
const getPipValue = async (pair, accountCurrency) => {
  const jpyPairs = ['USD/JPY', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'NZD/JPY', 'CAD/JPY', 'CHF/JPY'];
  const isJpyPair = jpyPairs.includes(pair);
  const [base, quote] = pair.split('/');
  
  // Standard pip size is 0.0001 for most pairs, 0.01 for JPY pairs
  const pipSize = isJpyPair ? 0.01 : 0.0001;
  
  // If account currency is the quote currency
  // Pip value = (pip size × lot size) / exchange rate
  // For 1 lot (100,000 units): pip value = pip size × 100,000
  // If quote is account currency: pip value = pip size × 100,000 = 10 for standard, 1000 for JPY
  if (quote === accountCurrency) {
    return isJpyPair ? 1000 : 10; // JPY pairs: 0.01 × 100,000 = 1000, others: 0.0001 × 100,000 = 10
  }
  
  // If account currency is the base currency
  // We need the exchange rate to convert
  if (base === accountCurrency) {
    const rate = await getExchangeRate(pair);
    // Pip value in base currency = (pip size × lot size) / rate
    // For standard pairs: (0.0001 × 100,000) / rate = 10 / rate
    // For JPY pairs: (0.01 × 100,000) / rate = 1000 / rate
    return isJpyPair ? 1000 / rate : 10 / rate;
  }
  
  // For cross pairs where account currency is neither base nor quote
  // We need to convert through the account currency
  // Get rate from account currency to quote, then calculate
  try {
    const accountToQuoteRate = await getExchangeRate(`${accountCurrency}/${quote}`);
    if (accountToQuoteRate && accountToQuoteRate > 0) {
      return isJpyPair ? 1000 / accountToQuoteRate : 10 / accountToQuoteRate;
    }
  } catch (err) {
    console.log(`Could not get rate for cross pair conversion`);
  }
  
  // Fallback: assume account currency is USD and quote is not USD
  // This is a rough approximation
  return isJpyPair ? 1000 : 10;
};

const calculateLotSize = async ({ accountBalance, riskPercent, stopLossPips, symbol, accountCurrency }) => {
  // Validate inputs
  if (!accountBalance || accountBalance <= 0) {
    throw new Error('Account balance must be greater than 0');
  }
  if (!riskPercent || riskPercent <= 0 || riskPercent > 100) {
    throw new Error('Risk percentage must be between 0 and 100');
  }
  if (!stopLossPips || stopLossPips <= 0) {
    throw new Error('Stop loss pips must be greater than 0');
  }
  if (!symbol) {
    throw new Error('Currency pair is required');
  }
  
  // Calculate risk amount in account currency
  const riskAmount = (accountBalance * riskPercent) / 100;
  
  // Get pip value for the pair in account currency (now async)
  const pipValue = await getPipValue(symbol, accountCurrency || 'USD');
  
  // Calculate position size in lots
  // Formula: Position Size (lots) = Risk Amount / (Pip Value × Stop Loss in Pips)
  // This ensures that if price moves by stopLossPips against us, we lose exactly riskAmount
  const positionSize = riskAmount / (pipValue * stopLossPips);
  
  // Ensure position size is not negative or zero
  if (positionSize <= 0 || !isFinite(positionSize)) {
    throw new Error('Invalid position size calculated');
  }
  
  // Calculate R:R ratio (default to 1:2, can be enhanced with take profit pips later)
  const rrRatio = '1:2.00';
  
  return {
    positionSize: parseFloat(positionSize.toFixed(2)),
    riskAmount: parseFloat(riskAmount.toFixed(2)),
    rrRatio: rrRatio,
    stopDistance: parseFloat(stopLossPips.toFixed(1)),
  };
};

module.exports = { calculateLotSize };
