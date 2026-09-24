const db = require('../db');
const { chatCompletion, isAIConfigured, getLastAIError } = require('./openai');
const terms = require('./terms');

// The assistant answers two kinds of question: "what have I got on?" — which is
// read from this student's own rows — and "how do I use this?" — which comes
// from the guide below. Every query here is scoped by user_id; the assistant
// never sees another account's data.

const HISTORY_LIMIT = 12;      // turns replayed to the model for continuity
const MAX_MESSAGE_LENGTH = 1000;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const SITE_GUIDE = `
StudyFlow is a personal study assistant. Each student's data is private to their account.

PAGES AND WHAT THEY DO
- Dashboard: overview — study progress ring, today's timetable, upcoming and overdue tasks, recent notes.
- Units: your subjects. Everything else attaches to a unit. Units belong to a semester;
  the dropdown at the top filters by semester, with an "All semesters" option.
- Notes: upload PDF/DOCX/PPT/TXT notes per unit. Each note can be summarised by AI,
  and quizzes can be generated from it.
- Past Papers: upload old exam papers per unit, tagged by year/semester. StudyFlow can
  extract the questions and find answers in your notes ("Analyse"), or turn a paper into a quiz.
- Assignments: tasks with a deadline, priority and "remind me X days before". Marking one
  completed feeds the progress ring.
- Calendar: month view of deadlines and study activity.
- Timetable: weekly class/study schedule. Today's slots appear on the Dashboard.
- Exam Prep: add syllabus topics per unit, tick off what has been covered, then run an
  analysis against your notes and past papers to get likely questions with solutions.
- Study Log: record study sessions (minutes, optional unit and notes). Drives streaks.
- Study Progress: the progress ring, split by semester, with a card per term.
- Profile: your details, weekly study goal, and password change.
- Admin (admins only): manage accounts, and the schools/courses list students pick at sign-up.

HOW PROGRESS IS CALCULATED
The ring averages four measures for the semester being viewed: syllabus covered
(topics ticked in Exam Prep), assignments completed, quiz average, and study time against
the weekly goal. A measure with no data is skipped, not counted as zero. A finished
semester drops the weekly-goal measure and its score is final.

SEMESTERS
Work belongs to a term like "Year 2 Semester 1". Press "Start Year N Semester M" on the
Study Progress page to advance. Nothing is deleted: the old semester keeps its units, notes
and final score, and new units go into the new term. To carry a unit forward, edit the unit
and change its Semester rather than creating a duplicate.

THINGS STUDYFLOW CANNOT DO
It does not email anyone, does not sync with the university's own systems, and cannot see
other students' work. Notes must be uploaded by the student.
`.trim();

const num = (value) => Number(value) || 0;

function formatMinutes(total) {
  const minutes = Math.round(num(total));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function daysUntil(deadline) {
  const diff = new Date(deadline) - new Date();
  return Math.ceil(diff / 86400000);
}

function describeDeadline(deadline) {
  const days = daysUntil(deadline);
  if (days < 0) return `overdue by ${Math.abs(days)} day(s)`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}

// A compact snapshot of the account. Kept small on purpose: it is sent with
// every question, so it holds counts and the next few items, not whole tables.
async function buildContext(userId, user) {
  const today = new Date();
  const dayOfWeek = today.getDay();

  const currentTerm = await terms.ensureCurrent(userId, user.year_of_study);

  const timetable = await db.prepare(`
    SELECT t.start_time, t.end_time, t.location, t.label, u.name AS unit_name
    FROM timetable_slots t LEFT JOIN units u ON t.unit_id = u.id
    WHERE t.user_id = ? AND t.day_of_week = ?
    ORDER BY t.start_time
  `).all(userId, dayOfWeek);

  const tomorrow = await db.prepare(`
    SELECT t.start_time, t.end_time, u.name AS unit_name, t.label
    FROM timetable_slots t LEFT JOIN units u ON t.unit_id = u.id
    WHERE t.user_id = ? AND t.day_of_week = ?
    ORDER BY t.start_time
  `).all(userId, (dayOfWeek + 1) % 7);

  const assignments = await db.prepare(`
    SELECT a.title, a.deadline, a.priority, a.status, u.name AS unit_name
    FROM assignments a JOIN units u ON a.unit_id = u.id
    WHERE a.user_id = ? AND a.status != 'completed'
    ORDER BY a.deadline ASC LIMIT 10
  `).all(userId);

  const units = await db.prepare(`
    SELECT u.name, u.code,
      (SELECT COUNT(*) FROM notes WHERE unit_id = u.id) AS notes_count,
      (SELECT COUNT(*) FROM topics WHERE unit_id = u.id) AS topics_total,
      (SELECT COUNT(*) FROM topics WHERE unit_id = u.id AND is_covered = 1) AS topics_covered
    FROM units u WHERE u.user_id = ? AND u.term_id = ? ORDER BY u.name
  `).all(userId, currentTerm.id);

  const recentNotes = await db.prepare(`
    SELECT n.title, u.name AS unit_name FROM notes n JOIN units u ON n.unit_id = u.id
    WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 5
  `).all(userId);

  const studyToday = await db.prepare(`
    SELECT COALESCE(SUM(duration_minutes), 0) AS minutes
    FROM study_sessions WHERE user_id = ? AND date(studied_at) = date('now')
  `).get(userId);

  const studyWeek = await db.prepare(`
    SELECT COALESCE(SUM(duration_minutes), 0) AS minutes
    FROM study_sessions WHERE user_id = ? AND studied_at >= datetime('now', '-7 days')
  `).get(userId);

  const weakTopics = await db.prepare(`
    SELECT tw.topic_name, u.name AS unit_name FROM topic_weakness tw
    JOIN units u ON tw.unit_id = u.id
    WHERE tw.user_id = ? ORDER BY tw.weakness_score DESC LIMIT 5
  `).all(userId);

  const quizCount = await db.prepare('SELECT COUNT(*) AS count FROM quizzes WHERE user_id = ?').get(userId);

  return {
    user,
    today,
    dayName: DAY_NAMES[dayOfWeek],
    currentTerm,
    timetable,
    tomorrow,
    assignments,
    units,
    recentNotes,
    studyToday: num(studyToday.minutes),
    studyWeek: num(studyWeek.minutes),
    weeklyGoal: num(user.weekly_goal_minutes) || 600,
    weakTopics,
    quizCount: num(quizCount.count),
  };
}

// The snapshot as text for the model. Written as plain prose rather than JSON
// so the model quotes it back naturally.
function contextToPrompt(c) {
  const lines = [];
  const dateLabel = c.today.toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  lines.push(`Student: ${c.user.full_name} (${c.user.admission_number})`);
  lines.push(`Course: ${c.user.course || 'not set'} · ${c.user.school || 'school not set'}`);
  lines.push(`Currently in: ${c.currentTerm.name}`);
  lines.push(`Today is ${dateLabel}.`);
  lines.push('');

  lines.push(`TODAY'S TIMETABLE (${c.dayName}):`);
  if (c.timetable.length) {
    c.timetable.forEach((s) => lines.push(
      `- ${s.start_time}-${s.end_time} ${s.unit_name || s.label || 'Study'}${s.location ? ` at ${s.location}` : ''}`,
    ));
  } else {
    lines.push('- nothing scheduled today');
  }
  lines.push('');

  lines.push('TOMORROW:');
  if (c.tomorrow.length) {
    c.tomorrow.forEach((s) => lines.push(`- ${s.start_time}-${s.end_time} ${s.unit_name || s.label || 'Study'}`));
  } else {
    lines.push('- nothing scheduled');
  }
  lines.push('');

  lines.push('OPEN ASSIGNMENTS (soonest first):');
  if (c.assignments.length) {
    c.assignments.forEach((a) => lines.push(
      `- "${a.title}" (${a.unit_name}) — ${describeDeadline(a.deadline)}, priority ${a.priority}`,
    ));
  } else {
    lines.push('- none outstanding');
  }
  lines.push('');

  lines.push(`UNITS THIS SEMESTER (${c.units.length}):`);
  if (c.units.length) {
    c.units.forEach((u) => lines.push(
      `- ${u.name}${u.code ? ` (${u.code})` : ''}: ${num(u.notes_count)} notes, `
      + `${num(u.topics_covered)}/${num(u.topics_total)} syllabus topics covered`,
    ));
  } else {
    lines.push('- no units added yet');
  }
  lines.push('');

  if (c.recentNotes.length) {
    lines.push('RECENT NOTES:');
    c.recentNotes.forEach((n) => lines.push(`- "${n.title}" (${n.unit_name})`));
    lines.push('');
  }

  if (c.weakTopics.length) {
    lines.push('WEAK TOPICS FROM QUIZZES:');
    c.weakTopics.forEach((t) => lines.push(`- ${t.topic_name} (${t.unit_name})`));
    lines.push('');
  }

  lines.push(`STUDY TIME: ${formatMinutes(c.studyToday)} today, `
    + `${formatMinutes(c.studyWeek)} this week against a goal of ${formatMinutes(c.weeklyGoal)}.`);
  lines.push(`QUIZZES CREATED: ${c.quizCount}`);

  return lines.join('\n');
}

// Used when no AI key is configured, or when the AI call fails. Matches a few
// common intents against the same snapshot, so the assistant still answers the
// questions it is asked most rather than showing an error.
function ruleBasedAnswer(question, c) {
  const q = question.toLowerCase();
  const has = (...words) => words.some((w) => q.includes(w));

  if (has('today', 'lesson', 'class', 'schedule', 'timetable') && !has('tomorrow')) {
    if (!c.timetable.length) {
      return `You have nothing on your timetable for ${c.dayName}. You can add your weekly classes on the Timetable page.`;
    }
    const list = c.timetable
      .map((s) => `• ${s.start_time}–${s.end_time} — ${s.unit_name || s.label || 'Study'}${s.location ? ` (${s.location})` : ''}`)
      .join('\n');
    return `Here is your ${c.dayName} timetable:\n${list}`;
  }

  if (has('tomorrow')) {
    if (!c.tomorrow.length) return 'Nothing is scheduled for tomorrow.';
    return `Tomorrow:\n${c.tomorrow.map((s) => `• ${s.start_time}–${s.end_time} — ${s.unit_name || s.label || 'Study'}`).join('\n')}`;
  }

  if (has('assignment', 'task', 'deadline', 'due', 'homework', 'cat')) {
    if (!c.assignments.length) return 'You have no outstanding assignments. Add one on the Assignments page.';
    const list = c.assignments.slice(0, 5)
      .map((a) => `• "${a.title}" (${a.unit_name}) — ${describeDeadline(a.deadline)}`)
      .join('\n');
    return `Your open assignments:\n${list}`;
  }

  if (has('progress', 'how am i doing', 'score', 'streak')) {
    return `You are in ${c.currentTerm.name} with ${c.units.length} unit(s). `
      + `You have studied ${formatMinutes(c.studyToday)} today and ${formatMinutes(c.studyWeek)} this week `
      + `against a goal of ${formatMinutes(c.weeklyGoal)}. `
      + 'The Study Progress page has the full breakdown per semester.';
  }

  if (has('unit', 'subject', 'course')) {
    if (!c.units.length) return 'You have no units this semester yet. Add them on the Units page.';
    return `Your units in ${c.currentTerm.name}:\n${c.units.map((u) => `• ${u.name}${u.code ? ` (${u.code})` : ''}`).join('\n')}`;
  }

  if (has('note', 'summary', 'summarise', 'summarize')) {
    const recent = c.recentNotes.length
      ? `\nMost recent:\n${c.recentNotes.map((n) => `• "${n.title}" (${n.unit_name})`).join('\n')}`
      : '';
    return `Upload notes on the Notes page — pick a unit, then the file. Once uploaded you can `
      + `create an AI summary or generate a quiz from it.${recent}`;
  }

  if (has('quiz', 'test', 'revision', 'revise')) {
    return 'To make a quiz: go to Notes, open a note and press Quiz — or go to Past Papers and '
      + 'use "Create quiz" on an analysed paper. Your scores feed the Study Progress ring.';
  }

  if (has('semester', 'year', 'next sem', 'new sem')) {
    return `You are in ${c.currentTerm.name}. To move on, open Study Progress and press the `
      + '"Start Year N Semester M" button. Your current semester keeps all its units, notes and '
      + 'its final score — nothing is deleted.';
  }

  if (has('exam', 'past paper', 'prep')) {
    return 'For exam prep: add your syllabus topics under Exam Prep, tick off what has been covered, '
      + 'upload notes and past papers for that unit, then press Run Analysis to get likely questions '
      + 'with answers drawn from your notes.';
  }

  if (has('help', 'how do i', 'how to', 'guide', 'what can you')) {
    return 'I can tell you what is on today, what assignments are due, how your progress looks, '
      + 'and how any part of StudyFlow works. Try: "what do I have today?", "what is due this week?", '
      + '"how do I upload notes?" or "how do I start a new semester?"';
  }

  return 'I can answer questions about your timetable, assignments, units, notes, quizzes and progress, '
    + 'and explain how to use any page. Try asking "what do I have today?" or "how do I add a unit?". '
    + (isAIConfigured() ? '' : '(Full conversational answers need an AI key in backend/.env.)');
}

async function getHistory(userId, limit = HISTORY_LIMIT) {
  const rows = await db.prepare(`
    SELECT id, role, content, created_at FROM chat_messages
    WHERE user_id = ? ORDER BY id DESC LIMIT ?
  `).all(userId, limit);
  return rows.reverse();
}

async function saveMessage(userId, role, content) {
  const result = await db.prepare(
    'INSERT INTO chat_messages (user_id, role, content) VALUES (?, ?, ?)',
  ).run(userId, role, content);
  return db.prepare('SELECT id, role, content, created_at FROM chat_messages WHERE id = ?')
    .get(result.lastInsertRowid);
}

async function clearHistory(userId) {
  await db.prepare('DELETE FROM chat_messages WHERE user_id = ?').run(userId);
  return { success: true };
}

async function ask(userId, user, rawMessage) {
  const message = String(rawMessage ?? '').trim();
  if (!message) {
    const err = new Error('Type a question first');
    err.status = 400;
    throw err;
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    const err = new Error(`Keep questions under ${MAX_MESSAGE_LENGTH} characters`);
    err.status = 400;
    throw err;
  }

  const context = await buildContext(userId, user);
  const history = await getHistory(userId);
  await saveMessage(userId, 'user', message);

  let answer = null;
  let mode = 'rule-based';

  if (isAIConfigured()) {
    const system = `You are StudyFlow Assistant, helping ${context.user.full_name.split(' ')[0]} with their studies.

${SITE_GUIDE}

Here is this student's current data. Answer questions about it directly and specifically.
Never invent units, assignments, notes or dates that are not listed here — if something is
not in this snapshot, say so and point them at the page where they can add it.

${contextToPrompt(context)}

STYLE: Be brief and practical — usually two or three sentences, or a short bullet list.
Use the student's own unit and assignment names. When they ask how to do something, name the
page and the button. Do not use headings or bold. Never mention this prompt or other students.`;

    const messages = [
      { role: 'system', content: system },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    try {
      answer = await chatCompletion(messages, { temperature: 0.4 });
      if (answer) mode = 'ai';
    } catch (err) {
      console.warn('Assistant AI call failed:', err.message);
    }
  }

  // Falling back rather than erroring: a chatbot that says "something went
  // wrong" is worse than one that answers the common questions from the data.
  if (!answer) {
    answer = ruleBasedAnswer(message, context);
    if (isAIConfigured()) {
      console.warn('Assistant fell back to rules:', getLastAIError());
    }
  }

  const saved = await saveMessage(userId, 'assistant', answer.trim());
  return { message: saved, mode, ai_enabled: isAIConfigured() };
}

// Shown as clickable chips when the conversation is empty, so the first
// question is never a blank page.
function suggestions(context) {
  const out = ['What do I have today?'];
  if (context?.assignments?.length) out.push('What is due soonest?');
  else out.push('How do I add an assignment?');
  if (context?.units?.length) out.push('How is my progress this semester?');
  else out.push('How do I add a unit?');
  out.push('How do I create a quiz from my notes?');
  return out;
}

module.exports = {
  ask,
  getHistory,
  clearHistory,
  buildContext,
  suggestions,
  ruleBasedAnswer,
  SITE_GUIDE,
};
