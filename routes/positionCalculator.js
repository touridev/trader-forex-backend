const express = require('express');
const router = express.Router();
const { calculateLotSize } = require('../services/positionCalculatorService');

router.post('/calculate', async (req, res) => {
  try {
    const { accountBalance, riskPercent, stopLossPips, symbol, accountCurrency } = req.body;
    const result = await calculateLotSize({ 
      accountBalance, 
      riskPercent, 
      stopLossPips, 
      symbol, 
      accountCurrency: accountCurrency || 'USD' 
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
