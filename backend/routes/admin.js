const express = require('express');
const users = require('../services/users');
const catalog = require('../services/catalog');

const router = express.Router();

// Turns the services' ValidationError into a 400 with the offending field, so
// the admin UI can highlight the input that needs fixing.
function handle(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof users.ValidationError) {
        return res.status(err.status || 400).json({ error: err.message, field: err.field });
      }
      next(err);
    }
  };
}

// ── Overview ───────────────────────────────────────────────────────────────

router.get('/stats', handle(async (_req, res) => {
  res.json(await users.getStats());
}));

// ── Accounts ───────────────────────────────────────────────────────────────

router.get('/users', handle(async (req, res) => {
  const { search, role, status } = req.query;
  res.json(await users.listUsers({ search, role, status }));
}));

router.put('/users/:id', handle(async (req, res) => {
  res.json({ user: await users.adminUpdateProfile(req.params.id, req.body || {}) });
}));

router.patch('/users/:id/role', handle(async (req, res) => {
  const { role } = req.body || {};
  res.json({ user: await users.setRole(req.params.id, role, req.userId) });
}));

router.patch('/users/:id/status', handle(async (req, res) => {
  const { is_active } = req.body || {};
  res.json({ user: await users.setActive(req.params.id, !!is_active, req.userId) });
}));

router.put('/users/:id/password', handle(async (req, res) => {
  const { password } = req.body || {};
  res.json(await users.adminResetPassword(req.params.id, password));
}));

router.delete('/users/:id', handle(async (req, res) => {
  res.json(await users.deleteUser(req.params.id, req.userId));
}));

// ── Schools ────────────────────────────────────────────────────────────────

router.get('/schools', handle(async (_req, res) => {
  res.json(await catalog.listSchools());
}));

router.post('/schools', handle(async (req, res) => {
  res.status(201).json(await catalog.createSchool(req.body || {}));
}));

router.put('/schools/:id', handle(async (req, res) => {
  res.json(await catalog.renameSchool(req.params.id, req.body || {}));
}));

router.delete('/schools/:id', handle(async (req, res) => {
  res.json(await catalog.deleteSchool(req.params.id));
}));

// ── Courses ────────────────────────────────────────────────────────────────

router.get('/courses', handle(async (req, res) => {
  res.json(await catalog.listCourses(req.query.school_id));
}));

router.post('/courses', handle(async (req, res) => {
  res.status(201).json(await catalog.createCourse(req.body || {}));
}));

router.put('/courses/:id', handle(async (req, res) => {
  res.json(await catalog.renameCourse(req.params.id, req.body || {}));
}));

router.delete('/courses/:id', handle(async (req, res) => {
  res.json(await catalog.deleteCourse(req.params.id));
}));

module.exports = router;
