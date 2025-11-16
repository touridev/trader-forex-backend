const express = require('express');
const router = express.Router();
const { db, bucket } = require('../firebase');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Get all trades
router.get('/', async (req, res) => {
  try {
    const snapshot = await db.collection('trades').orderBy('date','desc').get();
    const trades = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(trades);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new trade
router.post('/', upload.single('screenshot'), async (req, res) => {
  try {
    const { note, date, screenshotBase64, tradeAmount } = req.body;
    let screenshotUrl = null;

    if (req.file) {
      const blob = bucket.file(`screenshots/${Date.now()}_${req.file.originalname}`);
      const blobStream = blob.createWriteStream({ resumable: false });
      blobStream.end(req.file.buffer);
      screenshotUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
    }

    const tradeData = {
      note: note || '',
      date: date || new Date().toISOString(),
      screenshotUrl,
      screenshotBase64,
      tradeAmount: parseFloat(tradeAmount) || 0
    };

    const docRef = await db.collection('trades').add(tradeData);
    res.json({ id: docRef.id, ...tradeData });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Get monthly statistics
router.get('/monthly/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);
    
    // Get all trades and filter in memory (Firestore doesn't support range queries well)
    const allTradesSnapshot = await db.collection('trades').orderBy('date', 'desc').get();
    const allTrades = allTradesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Filter by date range
    const trades = allTrades.filter(trade => {
      const tradeDate = new Date(trade.date);
      return tradeDate >= startDate && tradeDate <= endDate;
    });
    
    // Calculate statistics
    const totalPL = trades.reduce((sum, trade) => sum + (parseFloat(trade.tradeAmount) || 0), 0);
    const winRate = trades.length > 0 
      ? (trades.filter(t => (parseFloat(t.tradeAmount) || 0) > 0).length / trades.length * 100).toFixed(1)
      : 0;
    const avgR = trades.length > 0 
      ? (totalPL / trades.length).toFixed(2)
      : 0;
    const bestDay = trades.reduce((max, trade) => {
      const amount = parseFloat(trade.tradeAmount) || 0;
      return amount > max ? amount : max;
    }, 0);
    
    // Group by day
    const tradesByDay = {};
    trades.forEach(trade => {
      const tradeDate = new Date(trade.date);
      const day = tradeDate.getDate();
      if (!tradesByDay[day]) {
        tradesByDay[day] = [];
      }
      tradesByDay[day].push(trade);
    });
    
    res.json({
      totalPL,
      winRate,
      avgR,
      bestDay,
      totalTrades: trades.length,
      tradesByDay
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Get trades for last 30 days
router.get('/last30days', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const snapshot = await db.collection('trades')
      .where('date', '>=', thirtyDaysAgo.toISOString())
      .orderBy('date', 'desc')
      .get();
    
    const trades = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Group by date for chart
    const dailyPL = {};
    trades.forEach(trade => {
      const tradeDate = new Date(trade.date);
      const dateKey = tradeDate.toISOString().split('T')[0];
      if (!dailyPL[dateKey]) {
        dailyPL[dateKey] = 0;
      }
      dailyPL[dateKey] += parseFloat(trade.tradeAmount) || 0;
    });
    
    res.json({ trades, dailyPL });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
