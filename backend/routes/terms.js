const express = require('express');
const terms = require('../services/terms');
const { ValidationError } = require('../services/users');

const router = express.Router();

function handle(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(err.status || 400).json({ error: err.message, field: err.field });
      }
      next(err);
    }
  };
}

router.get('/', handle(async (req, res) => {
  await terms.ensureCurrent(req.userId, req.user.year_of_study);
  res.json({
    terms: await terms.listTerms(req.userId),
    current: await terms.getCurrent(req.userId),
    next: terms.nextAfter(await terms.getCurrent(req.userId), req.user.semesters_per_year),
  });
}));

router.post('/', handle(async (req, res) => {
  res.status(201).json(await terms.createTerm(req.userId, req.body || {}, req.user.semesters_per_year));
}));

// One-click advance: the common case, so it does not need a form.
router.post('/next', handle(async (req, res) => {
  await terms.ensureCurrent(req.userId, req.user.year_of_study);
  res.status(201).json(await terms.startNext(req.userId, req.user.semesters_per_year));
}));

router.patch('/:id/activate', handle(async (req, res) => {
  res.json(await terms.activate(req.params.id, req.userId));
}));

router.put('/:id', handle(async (req, res) => {
  res.json(await terms.updateTerm(req.params.id, req.userId, req.body || {}, req.user.semesters_per_year));
}));

router.delete('/:id', handle(async (req, res) => {
  res.json(await terms.deleteTerm(req.params.id, req.userId));
}));

module.exports = router;
