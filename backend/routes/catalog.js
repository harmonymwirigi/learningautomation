const express = require('express');
const catalog = require('../services/catalog');

const router = express.Router();

// Public on purpose: the sign-up form needs the school and course lists before
// anyone has an account. It exposes names only — no student data.
router.get('/', async (_req, res, next) => {
  try {
    res.json(await catalog.getCatalog());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
