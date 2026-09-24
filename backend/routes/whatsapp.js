const express = require('express');
const { getStatus, sendNotification, isAnyConfigured } = require('../services/messaging');
const { buildDailyDigest, sendDailyDigest } = require('../services/studyDigest');
const { processWhatsAppAlerts } = require('../services/notifications');
const router = express.Router();

router.get('/status', (_req, res) => {
  res.json(getStatus());
});

router.post('/test', async (req, res, next) => {
  try {
    if (!isAnyConfigured()) {
      return res.status(400).json({
        error: 'No messaging channel configured. Set up Telegram (recommended) or WhatsApp in backend/.env — see .env.example',
      });
    }
    const result = await sendNotification(
      `✅ *StudyFlow connected!*\n\n${req.user.full_name}, you will receive assignment alerts, quiz results, and daily study updates here.`,
      { messageKey: `test:${req.userId}:${Date.now()}`, skipDedup: true },
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/digest', async (req, res, next) => {
  try {
    if (!isAnyConfigured()) {
      return res.status(400).json({ error: 'No messaging channel configured' });
    }
    const result = await sendDailyDigest(req.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/digest/preview', async (req, res, next) => {
  try {
    res.json({ text: await buildDailyDigest(req.userId) });
  } catch (err) {
    next(err);
  }
});

router.post('/sync-alerts', async (req, res, next) => {
  try {
    const results = await processWhatsAppAlerts(req.userId);
    res.json({ processed: results.length, results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
