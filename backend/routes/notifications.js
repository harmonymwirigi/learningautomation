const express = require('express');
const db = require('../db');
const { generateDeadlineNotifications, processWhatsAppAlerts } = require('../services/notifications');

const router = express.Router();

router.get('/', async (req, res) => {
  await generateDeadlineNotifications(req.userId);
  processWhatsAppAlerts(req.userId).catch(() => {});

  const notifications = await db.prepare(`
    SELECT n.*, a.title AS assignment_title, a.deadline, u.name AS unit_name
    FROM notifications n
    JOIN assignments a ON n.assignment_id = a.id
    JOIN units u ON a.unit_id = u.id
    WHERE n.user_id = ?
    ORDER BY n.is_read ASC, n.created_at DESC
  `).all(req.userId);
  res.json(notifications);
});

router.get('/unread-count', async (req, res) => {
  await generateDeadlineNotifications(req.userId);
  const { count } = await db.prepare(
    'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
  ).get(req.userId);
  res.json({ count });
});

router.patch('/:id/read', async (req, res) => {
  const result = await db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.userId);
  if (!result.changes) return res.status(404).json({ error: 'Notification not found' });
  res.json({ success: true });
});

router.patch('/read-all', async (req, res) => {
  await db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(req.userId);
  res.json({ success: true });
});

module.exports = router;
