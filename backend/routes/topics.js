const express = require('express');
const db = require('../db');

const router = express.Router();

async function ownsUnit(unitId, userId) {
  const unit = await db.prepare('SELECT id FROM units WHERE id = ? AND user_id = ?').get(unitId, userId);
  return !!unit;
}

router.get('/', async (req, res) => {
  const { unit_id } = req.query;
  if (!unit_id) return res.status(400).json({ error: 'unit_id is required' });
  if (!await ownsUnit(unit_id, req.userId)) return res.status(404).json({ error: 'Unit not found' });

  const topics = await db.prepare(`
    SELECT * FROM topics WHERE unit_id = ? AND user_id = ? ORDER BY sort_order, name
  `).all(unit_id, req.userId);

  const stats = await db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN is_covered = 1 THEN 1 ELSE 0 END) AS covered
    FROM topics WHERE unit_id = ? AND user_id = ?
  `).get(unit_id, req.userId);

  res.json({ topics, stats });
});

router.post('/', async (req, res) => {
  const { unit_id, name, sort_order } = req.body;
  if (!unit_id || !name?.trim()) {
    return res.status(400).json({ error: 'unit_id and name are required' });
  }
  if (!await ownsUnit(unit_id, req.userId)) return res.status(404).json({ error: 'Unit not found' });

  const result = await db.prepare(`
    INSERT INTO topics (user_id, unit_id, name, sort_order) VALUES (?, ?, ?, ?)
  `).run(req.userId, unit_id, name.trim(), sort_order ?? 0);

  const topic = await db.prepare('SELECT * FROM topics WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(topic);
});

router.post('/bulk', async (req, res) => {
  const { unit_id, topics } = req.body;
  if (!unit_id || !Array.isArray(topics) || topics.length === 0) {
    return res.status(400).json({ error: 'unit_id and topics array are required' });
  }
  if (!await ownsUnit(unit_id, req.userId)) return res.status(404).json({ error: 'Unit not found' });

  const insert = db.prepare('INSERT INTO topics (user_id, unit_id, name, sort_order) VALUES (?, ?, ?, ?)');
  const created = [];
  for (let i = 0; i < topics.length; i++) {
    const name = topics[i];
    if (!name?.trim()) continue;
    const r = await insert.run(req.userId, unit_id, name.trim(), i);
    created.push(await db.prepare('SELECT * FROM topics WHERE id = ?').get(r.lastInsertRowid));
  }

  res.status(201).json(created);
});

router.patch('/:id/cover', async (req, res) => {
  const { is_covered } = req.body;
  const covered = !!is_covered;
  const coveredAt = is_covered ? new Date().toISOString() : null;

  const result = await db.prepare(`
    UPDATE topics SET is_covered = ?, covered_at = ? WHERE id = ? AND user_id = ?
  `).run(covered, coveredAt, req.params.id, req.userId);

  if (!result.changes) return res.status(404).json({ error: 'Topic not found' });
  const topic = await db.prepare('SELECT * FROM topics WHERE id = ?').get(req.params.id);
  res.json(topic);
});

router.put('/:id', async (req, res) => {
  const existing = await db.prepare('SELECT * FROM topics WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Topic not found' });

  const { name, sort_order } = req.body;
  await db.prepare('UPDATE topics SET name = ?, sort_order = ? WHERE id = ? AND user_id = ?').run(
    name?.trim() || existing.name,
    sort_order ?? existing.sort_order,
    req.params.id,
    req.userId,
  );

  res.json(await db.prepare('SELECT * FROM topics WHERE id = ?').get(req.params.id));
});

router.delete('/:id', async (req, res) => {
  const result = await db.prepare('DELETE FROM topics WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.userId);
  if (!result.changes) return res.status(404).json({ error: 'Topic not found' });
  res.json({ success: true });
});

module.exports = router;
