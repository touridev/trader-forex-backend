const express = require('express');
const axios = require('axios');
const { DateTime } = require('luxon');
const router = express.Router();
const MARKETSTACK_KEY = process.env.MARKETSTACK_KEY;

// Forex market hours (GMT/UTC)
// These are the actual forex trading hours, not stock market hours
const forexMarkets = [
  {
    name: 'Sydney',
    timezone: 'Australia/Sydney',
    openGMT: '22:00', // 22:00 GMT (8:00 AM Sydney time next day)
    closeGMT: '07:00', // 07:00 GMT (5:00 PM Sydney time)
    color: '#6FCF97'
  },
  {
    name: 'Tokyo',
    timezone: 'Asia/Tokyo',
    openGMT: '00:00', // 00:00 GMT (9:00 AM Tokyo time)
    closeGMT: '09:00', // 09:00 GMT (6:00 PM Tokyo time)
    color: '#F2994A'
  },
  {
    name: 'London',
    timezone: 'Europe/London',
    openGMT: '08:00', // 08:00 GMT (8:00 AM London time)
    closeGMT: '17:00', // 17:00 GMT (5:00 PM London time)
    color: '#56CCF2'
  },
  {
    name: 'New York',
    timezone: 'America/New_York',
    openGMT: '13:00', // 13:00 GMT (8:00 AM New York time)
    closeGMT: '22:00', // 22:00 GMT (5:00 PM New York time)
    color: '#EB5757'
  }
];

async function getExchangeInfo(mic) {
  const url = `https://api.marketstack.com/v2/exchanges/${mic}?access_key=${MARKETSTACK_KEY}`;
  const res = await axios.get(url);
  return res.data;
}

router.get('/', async (req, res) => {
  try {
    const nowUTC = DateTime.now().setZone('UTC');
    const currentHour = nowUTC.hour;
    const currentMinute = nowUTC.minute;
    const currentTime = currentHour + currentMinute / 60;

    const results = forexMarkets.map((market) => {
      const [openHour, openMin] = market.openGMT.split(':').map(Number);
      const [closeHour, closeMin] = market.closeGMT.split(':').map(Number);
      const openTime = openHour + openMin / 60;
      const closeTime = closeHour + closeMin / 60;

      let isOpen = false;
      
      // Handle overnight sessions (e.g., Sydney 22:00 GMT to 07:00 GMT next day)
      if (openTime > closeTime) {
        // Session spans midnight
        isOpen = currentTime >= openTime || currentTime < closeTime;
      } else {
        // Normal session
        isOpen = currentTime >= openTime && currentTime < closeTime;
      }

      // Get local time for display
      const nowLocal = DateTime.now().setZone(market.timezone);
      const localTime = nowLocal.toFormat('HH:mm');

      // Create UTC times for timeline display
      const today = nowUTC.startOf('day');
      const openUtc = today.plus({ hours: openHour, minutes: openMin });
      let closeUtc = today.plus({ hours: closeHour, minutes: closeMin });
      
      // If close is before open, it's next day
      if (openTime > closeTime) {
        closeUtc = closeUtc.plus({ days: 1 });
      }

      return {
        name: market.name,
        timezone: market.timezone,
        open: market.openGMT,
        close: market.closeGMT,
        openLocal: nowLocal.set({ hour: openHour, minute: openMin }).toFormat('HH:mm'),
        closeLocal: nowLocal.set({ hour: closeHour, minute: closeMin }).toFormat('HH:mm'),
        localTime: localTime,
        isOpen,
        openUtc: openUtc.toISO(),
        closeUtc: closeUtc.toISO(),
        color: market.color
      };
    });

    res.json({ markets: results, currentTimeUTC: nowUTC.toISO() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get market hours' });
  }
});

module.exports = router;