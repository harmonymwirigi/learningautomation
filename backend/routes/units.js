const express = require('express');
const db = require('../db');
const terms = require('../services/terms');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    // ?term_id=<id> narrows to one semester; ?term_id=all shows every semester.
    const { term_id: termId } = req.query;
    const scoped = termId && termId !== 'all';

    const units = await db.prepare(`
      SELECT u.*, t.year_of_study, t.semester, t.label AS term_label,
        (SELECT COUNT(*) FROM notes WHERE unit_id = u.id) AS notes_count,
        (SELECT COUNT(*) FROM past_papers WHERE unit_id = u.id) AS papers_count,
        (SELECT COUNT(*) FROM assignments WHERE unit_id = u.id AND status != 'completed') AS assignments_count
      FROM units u
      LEFT JOIN terms t ON u.term_id = t.id
      WHERE u.user_id = ?${scoped ? ' AND u.term_id = ?' : ''}
      ORDER BY u.name
    `).all(...(scoped ? [req.userId, termId] : [req.userId]));
    res.json(units);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const unit = await db.prepare('SELECT * FROM units WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.userId);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    res.json(unit);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, code, description, color, term_id: termId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

    // Defaults to whichever semester is running, so adding a unit needs no extra thought.
    const term = termId
      ? await terms.findTerm(termId, req.userId)
      : await terms.ensureCurrent(req.userId, req.user.year_of_study);

    const result = await db.prepare(
      'INSERT INTO units (user_id, term_id, name, code, description, color) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(req.userId, term.id, name.trim(), code?.trim() || null, description?.trim() || null, color || '#6366f1');

    const unit = await db.prepare('SELECT * FROM units WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(unit);
  } catch (err) {
    if (err.field) return res.status(400).json({ error: err.message, field: err.field });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, code, description, color, term_id: termId } = req.body;
    const existing = await db.prepare('SELECT * FROM units WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.userId);
    if (!existing) return res.status(404).json({ error: 'Unit not found' });

    // Moving a unit carries its whole history — notes, tasks, quizzes — with it,
    // because they are all reached through the unit.
    const nextTermId = termId === undefined
      ? existing.term_id
      : (await terms.findTerm(termId, req.userId)).id;

    await db.prepare(
      'UPDATE units SET name = ?, code = ?, description = ?, color = ?, term_id = ? WHERE id = ? AND user_id = ?',
    ).run(
      name?.trim() || existing.name,
      code?.trim() ?? existing.code,
      description?.trim() ?? existing.description,
      color || existing.color,
      nextTermId,
      req.params.id,
      req.userId,
    );

    const unit = await db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
    res.json(unit);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await db.prepare('DELETE FROM units WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.userId);
    if (!result.changes) return res.status(404).json({ error: 'Unit not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
