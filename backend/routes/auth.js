const express = require('express');
const users = require('../services/users');
const { createToken, getTokenTtlSeconds } = require('../services/auth');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function handleError(err, res, next) {
  if (err instanceof users.ValidationError) {
    return res.status(err.status || 400).json({ error: err.message, field: err.field });
  }
  return next(err);
}

function session(user) {
  return { user, token: createToken(user.id), expires_in: getTokenTtlSeconds() };
}

router.post('/register', async (req, res, next) => {
  try {
    const user = await users.register(req.body || {});
    res.status(201).json(session(user));
  } catch (err) {
    handleError(err, res, next);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { identifier, email, admission_number, password } = req.body || {};
    const login = identifier || email || admission_number;
    if (!login || !password) {
      return res.status(400).json({ error: 'Enter your email/admission number and password' });
    }
    const user = await users.login(login, password);
    res.json(session(user));
  } catch (err) {
    handleError(err, res, next);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await users.updateProfile(req.userId, req.body || {});
    res.json({ user });
  } catch (err) {
    handleError(err, res, next);
  }
});

router.put('/me/password', requireAuth, async (req, res, next) => {
  try {
    res.json(await users.changePassword(req.userId, req.body || {}));
  } catch (err) {
    handleError(err, res, next);
  }
});

// Lets the sign-in screen say "create the first account" instead of implying
// there is something to log into on a brand-new install.
router.get('/status', async (_req, res, next) => {
  try {
    res.json({ has_accounts: (await users.countUsers()) > 0 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
