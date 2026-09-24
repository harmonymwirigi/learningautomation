const express = require('express');
const db = require('../db');
const { generateDeadlineNotifications, processWhatsAppAlerts } = require('../services/notifications');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const userId = req.userId;
    await generateDeadlineNotifications(userId);
    processWhatsAppAlerts(userId).catch(() => {});

    const stats = {
      units: (await db.prepare('SELECT COUNT(*) AS count FROM units WHERE user_id = ?').get(userId)).count,
      notes: (await db.prepare('SELECT COUNT(*) AS count FROM notes WHERE user_id = ?').get(userId)).count,
      past_papers: (await db.prepare('SELECT COUNT(*) AS count FROM past_papers WHERE user_id = ?').get(userId)).count,
      pending_assignments: (await db.prepare("SELECT COUNT(*) AS count FROM assignments WHERE user_id = ? AND status != 'completed'").get(userId)).count,
      unread_notifications: (await db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0').get(userId)).count,
    };

    const upcoming = await db.prepare(`
      SELECT a.*, u.name AS unit_name, u.color AS unit_color
      FROM assignments a JOIN units u ON a.unit_id = u.id
      WHERE a.user_id = ? AND a.status != 'completed' AND a.deadline >= datetime('now')
      ORDER BY a.deadline ASC LIMIT 5
    `).all(userId);

    const overdue = await db.prepare(`
      SELECT a.*, u.name AS unit_name, u.color AS unit_color
      FROM assignments a JOIN units u ON a.unit_id = u.id
      WHERE a.user_id = ? AND a.status != 'completed' AND a.deadline < datetime('now')
      ORDER BY a.deadline ASC LIMIT 5
    `).all(userId);

    const recentNotes = await db.prepare(`
      SELECT n.*, u.name AS unit_name FROM notes n
      JOIN units u ON n.unit_id = u.id
      WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 5
    `).all(userId);

    const studyStats = await db.prepare(`
      SELECT COALESCE(SUM(duration_minutes), 0) AS today_minutes
      FROM study_sessions WHERE user_id = ? AND date(studied_at) = date('now')
    `).get(userId);

    const todayTimetable = await db.prepare(`
      SELECT t.*, u.name AS unit_name, u.color AS unit_color
      FROM timetable_slots t LEFT JOIN units u ON t.unit_id = u.id
      WHERE t.user_id = ? AND t.day_of_week = ?
      ORDER BY t.start_time
    `).all(userId, new Date().getDay());

    const quizStats = {
      total_quizzes: (await db.prepare('SELECT COUNT(*) AS count FROM quizzes WHERE user_id = ?').get(userId)).count,
      total_attempts: (await db.prepare('SELECT COUNT(*) AS count FROM quiz_attempts WHERE user_id = ? AND completed_at IS NOT NULL').get(userId)).count,
      summaries: (await db.prepare('SELECT COUNT(*) AS count FROM note_summaries WHERE user_id = ?').get(userId)).count,
      avg_score: (await db.prepare(`
        SELECT ROUND(AVG(CAST(score AS REAL) / NULLIF(total, 0)) * 100) AS avg
        FROM quiz_attempts WHERE user_id = ? AND completed_at IS NOT NULL AND total > 0
      `).get(userId)).avg || 0,
    };

    const weakTopics = await db.prepare(`
      SELECT tw.*, u.name AS unit_name, u.color AS unit_color
      FROM topic_weakness tw JOIN units u ON tw.unit_id = u.id
      WHERE tw.user_id = ?
      ORDER BY tw.weakness_score DESC LIMIT 5
    `).all(userId);

    const recentQuizAttempts = (await db.prepare(`
      SELECT a.score, a.total, a.completed_at, q.title AS quiz_title, u.name AS unit_name
      FROM quiz_attempts a
      JOIN quizzes q ON a.quiz_id = q.id
      JOIN units u ON q.unit_id = u.id
      WHERE a.user_id = ? AND a.completed_at IS NOT NULL
      ORDER BY a.completed_at DESC LIMIT 3
    `).all(userId)).map((a) => ({
      ...a,
      percentage: a.total ? Math.round((a.score / a.total) * 100) : 0,
    }));

    res.json({
      stats, upcoming, overdue, recentNotes, studyStats,
      todayTimetable, quizStats, weakTopics, recentQuizAttempts,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
