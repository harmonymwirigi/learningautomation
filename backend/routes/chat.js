const express = require('express');
const assistant = require('../services/assistant');
const { isAIConfigured } = require('../services/openai');

const router = express.Router();

// Past conversation plus a few starter questions tailored to what this student
// actually has, so an empty chat is not a blank box.
router.get('/', async (req, res, next) => {
  try {
    const context = await assistant.buildContext(req.userId, req.user);
    res.json({
      messages: await assistant.getHistory(req.userId, 50),
      suggestions: assistant.suggestions(context),
      ai_enabled: isAIConfigured(),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { message } = req.body || {};
    res.json(await assistant.ask(req.userId, req.user, message));
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    res.json(await assistant.clearHistory(req.userId));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
