const db = require('../db');

// Study progress is derived from what the student already records — syllabus
// topics, assignments, quiz attempts and study sessions. Nothing here is a
// separate thing to keep up to date; it is a reading of the existing data.

const num = (value) => Number(value) || 0;
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function toDayString(date) {
  // Local calendar day, matching how date(studied_at) is stored/compared.
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

// Counts back from today. A day studied yesterday but not today still counts,
// so the streak does not appear broken simply because it is early morning.
function currentStreak(days) {
  const set = new Set(days);
  const today = new Date();
  if (!set.has(toDayString(today))) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (!set.has(toDayString(yesterday))) return 0;
    today.setDate(today.getDate() - 1);
  }

  let streak = 0;
  const cursor = new Date(today);
  while (set.has(toDayString(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function longestStreak(days) {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let previous = null;

  for (const day of sorted) {
    if (previous) {
      const gap = (new Date(day) - new Date(previous)) / 86400000;
      run = gap === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    previous = day;
  }
  return best;
}

// The last 7 calendar days including today, with zero-filled gaps so the chart
// keeps a stable shape instead of collapsing on quiet weeks.
function buildWeekChart(rows) {
  const byDay = new Map(rows.map((r) => [String(r.day).slice(0, 10), num(r.minutes)]));
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = toDayString(date);
    out.push({
      day: key,
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
      minutes: byDay.get(key) || 0,
    });
  }
  return out;
}

// Scoping works off the units in a term. Assignments, topics, quizzes and notes
// are all reached through a unit, so one term filter narrows everything at once;
// study sessions carry their own term_id because they can exist without a unit.
function termFilters(termId) {
  if (!termId) return { viaUnit: '', session: '' };
  return {
    viaUnit: ' AND unit_id IN (SELECT id FROM units WHERE user_id = ? AND term_id = ?)',
    session: ' AND term_id = ?',
  };
}

// `isLive` says whether the scope includes right now — the current semester, or
// all time. A finished semester is judged on what it achieved (syllabus, tasks,
// quizzes); measuring it against *this* week's study goal would score every past
// term at 0% for the crime of being over.
async function getProgress(userId, weeklyGoalMinutes = 600, termId = null, isLive = true) {
  const f = termFilters(termId);
  const viaUnit = termId ? [userId, termId] : [];
  const direct = termId ? [termId] : [];

  const one = async (sql, ...params) => (await db.prepare(sql).get(userId, ...params)) || {};

  const topics = await one(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN is_covered = 1 THEN 1 ELSE 0 END) AS covered
    FROM topics WHERE user_id = ?${f.viaUnit}
  `, ...viaUnit);

  const assignments = await one(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN status != 'completed' AND deadline < datetime('now') THEN 1 ELSE 0 END) AS overdue
    FROM assignments WHERE user_id = ?${f.viaUnit}
  `, ...viaUnit);

  const quizFilter = termId
    ? ' AND quiz_id IN (SELECT id FROM quizzes WHERE user_id = ?'
      + ' AND unit_id IN (SELECT id FROM units WHERE user_id = ? AND term_id = ?))'
    : '';
  const quizzes = await one(`
    SELECT COUNT(*) AS attempts,
      ROUND(AVG(CAST(score AS REAL) / NULLIF(total, 0)) * 100) AS avg_score
    FROM quiz_attempts
    WHERE user_id = ? AND completed_at IS NOT NULL AND total > 0${quizFilter}
  `, ...(termId ? [userId, userId, termId] : []));

  const study = await one(`
    SELECT COALESCE(SUM(duration_minutes), 0) AS total_minutes, COUNT(*) AS sessions
    FROM study_sessions WHERE user_id = ?${f.session}
  `, ...direct);

  const today = await one(`
    SELECT COALESCE(SUM(duration_minutes), 0) AS minutes
    FROM study_sessions WHERE user_id = ?${f.session} AND date(studied_at) = date('now')
  `, ...direct);

  const week = await one(`
    SELECT COALESCE(SUM(duration_minutes), 0) AS minutes
    FROM study_sessions WHERE user_id = ?${f.session} AND studied_at >= datetime('now', '-7 days')
  `, ...direct);

  const dailyRows = await db.prepare(`
    SELECT date(studied_at) AS day, SUM(duration_minutes) AS minutes
    FROM study_sessions WHERE user_id = ?${f.session} AND studied_at >= datetime('now', '-7 days')
    GROUP BY date(studied_at) ORDER BY day ASC
  `).all(userId, ...direct);

  const studyDays = (await db.prepare(`
    SELECT DISTINCT date(studied_at) AS day FROM study_sessions WHERE user_id = ?${f.session}
  `).all(userId, ...direct)).map((r) => String(r.day).slice(0, 10));

  const perUnit = (await db.prepare(`
    SELECT u.id, u.name, u.code, u.color,
      (SELECT COUNT(*) FROM topics WHERE unit_id = u.id) AS topics_total,
      (SELECT COUNT(*) FROM topics WHERE unit_id = u.id AND is_covered = 1) AS topics_covered,
      (SELECT COUNT(*) FROM assignments WHERE unit_id = u.id) AS assignments_total,
      (SELECT COUNT(*) FROM assignments WHERE unit_id = u.id AND status = 'completed') AS assignments_done,
      (SELECT COUNT(*) FROM notes WHERE unit_id = u.id) AS notes_count,
      (SELECT COALESCE(SUM(duration_minutes), 0) FROM study_sessions WHERE unit_id = u.id) AS study_minutes,
      (SELECT ROUND(AVG(CAST(a.score AS REAL) / NULLIF(a.total, 0)) * 100)
         FROM quiz_attempts a JOIN quizzes q ON a.quiz_id = q.id
         WHERE q.unit_id = u.id AND a.completed_at IS NOT NULL AND a.total > 0) AS avg_quiz
    FROM units u WHERE u.user_id = ?${termId ? ' AND u.term_id = ?' : ''} ORDER BY u.name
  `).all(userId, ...direct)).map((u) => {
    const topicsTotal = num(u.topics_total);
    const topicsCovered = num(u.topics_covered);
    const assignmentsTotal = num(u.assignments_total);
    const assignmentsDone = num(u.assignments_done);

    // A unit's own score blends whichever of the three signals it actually has,
    // so a unit with no quizzes yet is not dragged to zero by them.
    const parts = [];
    if (topicsTotal) parts.push(pct(topicsCovered, topicsTotal));
    if (assignmentsTotal) parts.push(pct(assignmentsDone, assignmentsTotal));
    if (u.avg_quiz != null) parts.push(num(u.avg_quiz));

    return {
      id: u.id,
      name: u.name,
      code: u.code,
      color: u.color,
      topics_total: topicsTotal,
      topics_covered: topicsCovered,
      topics_percent: pct(topicsCovered, topicsTotal),
      assignments_total: assignmentsTotal,
      assignments_done: assignmentsDone,
      notes_count: num(u.notes_count),
      study_minutes: num(u.study_minutes),
      avg_quiz: u.avg_quiz == null ? null : num(u.avg_quiz),
      percent: parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0,
      has_data: parts.length > 0,
    };
  });

  const topicsTotal = num(topics.total);
  const topicsCovered = num(topics.covered);
  const assignmentsTotal = num(assignments.total);
  const assignmentsDone = num(assignments.done);
  const weekMinutes = num(week.minutes);
  const goal = Number(weeklyGoalMinutes) || 600;

  // Each component reports whether it has anything to measure. The overall
  // figure averages only those, so an empty section never counts as 0%.
  const components = [
    {
      key: 'syllabus',
      label: 'Syllabus covered',
      percent: pct(topicsCovered, topicsTotal),
      detail: topicsTotal ? `${topicsCovered} of ${topicsTotal} topics` : 'Add syllabus topics to a unit',
      available: topicsTotal > 0,
    },
    {
      key: 'assignments',
      label: 'Assignments done',
      percent: pct(assignmentsDone, assignmentsTotal),
      detail: assignmentsTotal ? `${assignmentsDone} of ${assignmentsTotal} completed` : 'No assignments yet',
      available: assignmentsTotal > 0,
    },
    {
      key: 'quizzes',
      label: 'Quiz average',
      percent: num(quizzes.avg_score),
      detail: num(quizzes.attempts) ? `${num(quizzes.attempts)} attempt(s) marked` : 'Take a quiz to see this',
      available: num(quizzes.attempts) > 0,
    },
    {
      key: 'consistency',
      label: 'Weekly study goal',
      percent: Math.min(100, pct(weekMinutes, goal)),
      detail: isLive
        ? `${weekMinutes} of ${goal} min this week`
        : 'Only tracked for the semester in progress',
      available: isLive,
    },
  ];

  const measured = components.filter((c) => c.available);
  const overallPercent = measured.length
    ? Math.round(measured.reduce((sum, c) => sum + c.percent, 0) / measured.length)
    : 0;

  const labels = [
    [0, 'Just getting started'],
    [25, 'Building momentum'],
    [50, 'Solid progress'],
    [75, 'Well on track'],
    [90, 'Exam ready'],
  ];
  const label = labels.reduce((acc, [min, text]) => (overallPercent >= min ? text : acc), labels[0][1]);

  return {
    overall: {
      percent: overallPercent,
      label,
      measured_components: measured.length,
      total_components: components.length,
    },
    components,
    streak: {
      current_days: currentStreak(studyDays),
      best_days: longestStreak(studyDays),
      total_days: studyDays.length,
    },
    study: {
      today_minutes: num(today.minutes),
      week_minutes: weekMinutes,
      total_minutes: num(study.total_minutes),
      sessions: num(study.sessions),
      weekly_goal_minutes: goal,
    },
    is_live: isLive,
    weekly_chart: isLive ? buildWeekChart(dailyRows) : [],
    totals: {
      topics_total: topicsTotal,
      topics_covered: topicsCovered,
      assignments_total: assignmentsTotal,
      assignments_done: assignmentsDone,
      assignments_overdue: num(assignments.overdue),
      quiz_attempts: num(quizzes.attempts),
    },
    per_unit: perUnit,
  };
}

// One headline figure per term, for the semester selector and history strip.
// Terms are few (a degree is ~8), so running the full calculation per term is
// simpler than a second, divergent set of queries.
async function getTermSummaries(userId, weeklyGoalMinutes, termList, currentTermId) {
  const summaries = [];
  for (const term of termList) {
    const isCurrent = Number(term.id) === Number(currentTermId);
    const p = await getProgress(userId, weeklyGoalMinutes, term.id, isCurrent);
    summaries.push({
      id: term.id,
      name: term.name,
      year_of_study: term.year_of_study,
      semester: term.semester,
      is_current: isCurrent,
      started_at: term.started_at,
      ended_at: term.ended_at,
      percent: p.overall.percent,
      units_count: p.per_unit.length,
      study_minutes: p.study.total_minutes,
      topics_covered: p.totals.topics_covered,
      topics_total: p.totals.topics_total,
      assignments_done: p.totals.assignments_done,
      assignments_total: p.totals.assignments_total,
      quiz_attempts: p.totals.quiz_attempts,
      has_data: p.per_unit.length > 0 || p.study.total_minutes > 0,
    });
  }
  return summaries;
}

module.exports = { getProgress, getTermSummaries, currentStreak, longestStreak };
