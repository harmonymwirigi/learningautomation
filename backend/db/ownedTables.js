// Tables that hold per-account data and therefore carry a user_id column.
//
// quiz_questions and quiz_answers are deliberately absent: they are only ever
// reached through quizzes / quiz_attempts, which are scoped, so scoping them
// again would add columns nothing queries.
const OWNED_TABLES = [
  'chat_messages',
  'terms',
  'units',
  'notes',
  'past_papers',
  'assignments',
  'study_sessions',
  'notifications',
  'training_logs',
  'topics',
  'timetable_slots',
  'exam_analyses',
  'note_summaries',
  'quizzes',
  'quiz_attempts',
  'topic_weakness',
  'paper_questions',
];

module.exports = { OWNED_TABLES };
