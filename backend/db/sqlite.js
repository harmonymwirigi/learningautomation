const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const { OWNED_TABLES } = require('./ownedTables');
const { DEFAULT_CATALOG } = require('./defaultCatalog');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'study.db');
let db;

function persist() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// sql.js rejects `undefined` outright, while node-postgres silently treats it
// as NULL. Normalising here means a query behaves the same on both engines
// instead of only failing on SQLite.
function normalize(params) {
  return params.map((p) => (p === undefined ? null : p));
}

function prepare(sql) {
  return {
    run(...args) {
      const params = normalize(args);
      db.run(sql, params);
      const lastId = db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] ?? 0;
      const changes = db.getRowsModified();
      persist();
      return Promise.resolve({ lastInsertRowid: lastId, changes });
    },
    get(...args) {
      const params = normalize(args);
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params);
        if (stmt.step()) return Promise.resolve(stmt.getAsObject());
        return Promise.resolve(undefined);
      } finally {
        stmt.free();
      }
    },
    all(...args) {
      const params = normalize(args);
      const results = [];
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params);
        while (stmt.step()) results.push(stmt.getAsObject());
        return Promise.resolve(results);
      } finally {
        stmt.free();
      }
    },
  };
}

function exec(sql) {
  db.exec(sql);
  persist();
  return Promise.resolve();
}

async function init() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      admission_number TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      school TEXT,
      course TEXT,
      year_of_study INTEGER,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      is_active INTEGER NOT NULL DEFAULT 1,
      weekly_goal_minutes INTEGER NOT NULL DEFAULT 600,
      semesters_per_year INTEGER NOT NULL DEFAULT 2,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS schools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(school_id, name),
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      year_of_study INTEGER NOT NULL,
      semester INTEGER NOT NULL,
      label TEXT,
      is_current INTEGER NOT NULL DEFAULT 0,
      started_at TEXT DEFAULT (date('now')),
      ended_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, year_of_study, semester),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      term_id INTEGER,
      name TEXT NOT NULL,
      code TEXT,
      description TEXT,
      color TEXT DEFAULT '#6366f1',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      unit_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_size INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS past_papers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      unit_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      year TEXT,
      semester TEXT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_size INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      unit_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      deadline TEXT NOT NULL,
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'pending',
      reminder_days INTEGER DEFAULT 3,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      term_id INTEGER,
      unit_id INTEGER,
      duration_minutes INTEGER NOT NULL,
      notes TEXT,
      studied_at TEXT DEFAULT (datetime('now')),
      topic_name TEXT,
      session_type TEXT DEFAULT 'manual',
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      assignment_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'deadline',
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS training_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      unit_id INTEGER,
      log_date TEXT NOT NULL DEFAULT (date('now')),
      topic TEXT NOT NULL,
      learned TEXT,
      goals TEXT,
      cursor_notes TEXT,
      rating INTEGER DEFAULT 3,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      unit_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      is_covered INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      covered_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS timetable_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      unit_id INTEGER,
      label TEXT,
      location TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS exam_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      unit_id INTEGER NOT NULL,
      paper_id INTEGER,
      analysis_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
      FOREIGN KEY (paper_id) REFERENCES past_papers(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS note_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      note_id INTEGER NOT NULL UNIQUE,
      summary_text TEXT NOT NULL,
      key_points_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      note_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      question_type TEXT DEFAULT 'mcq',
      options_json TEXT,
      correct_answer TEXT NOT NULL,
      topic TEXT,
      sort_order INTEGER DEFAULT 0,
      source_paper TEXT,
      note_refs_json TEXT,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      quiz_id INTEGER NOT NULL,
      score INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      weak_topics_json TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS quiz_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      user_answer TEXT,
      is_correct INTEGER DEFAULT 0,
      ai_feedback TEXT,
      score REAL DEFAULT 0,
      FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS topic_weakness (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      unit_id INTEGER NOT NULL,
      topic_name TEXT NOT NULL,
      weakness_score INTEGER DEFAULT 1,
      source TEXT DEFAULT 'quiz',
      last_assessed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
      UNIQUE(unit_id, topic_name)
    );
    CREATE TABLE IF NOT EXISTS whatsapp_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_key TEXT NOT NULL UNIQUE,
      message_preview TEXT,
      sent_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS paper_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      paper_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      topic TEXT,
      solution_text TEXT,
      note_refs_json TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (paper_id) REFERENCES past_papers(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
    );
  `);

  migrateToMultiUser();
  migrateToRoles();
  seedSchools();

  console.log('Database: local SQLite (backend/data/study.db)');
}

// Accounts created before admin support have neither column; both get a
// default that keeps every existing student exactly as they were.
function migrateToRoles() {
  const columns = tableColumns('users');
  let changed = false;

  if (!columns.includes('role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'");
    changed = true;
  }
  if (!columns.includes('is_active')) {
    db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
    changed = true;
  }
  if (!columns.includes('weekly_goal_minutes')) {
    db.exec('ALTER TABLE users ADD COLUMN weekly_goal_minutes INTEGER NOT NULL DEFAULT 600');
    changed = true;
  }
  if (!columns.includes('semesters_per_year')) {
    db.exec('ALTER TABLE users ADD COLUMN semesters_per_year INTEGER NOT NULL DEFAULT 2');
    changed = true;
  }

  for (const table of ['units', 'study_sessions']) {
    if (!tableColumns(table).includes('term_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN term_id INTEGER`);
      changed = true;
    }
  }

  if (changed) {
    persist();
    console.log('Database: added admin roles and account status to users');
  }
}

// A fresh install would otherwise show an empty school dropdown at sign-up.
// These are only starting points — an admin can rename or remove any of them.
function seedSchools() {
  const count = db.exec('SELECT COUNT(*) FROM schools')[0]?.values[0]?.[0] || 0;
  if (count > 0) return;

  for (const [school, courses] of Object.entries(DEFAULT_CATALOG)) {
    db.run('INSERT INTO schools (name) VALUES (?)', [school]);
    const schoolId = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
    for (const course of courses) {
      db.run('INSERT INTO courses (school_id, name) VALUES (?, ?)', [schoolId, course]);
    }
  }
  persist();
  console.log(`Database: seeded ${Object.keys(DEFAULT_CATALOG).length} default schools`);
}

function tableColumns(table) {
  const res = db.exec(`PRAGMA table_info(${table})`);
  if (!res.length) return [];
  const nameIdx = res[0].columns.indexOf('name');
  return res[0].values.map((row) => row[nameIdx]);
}

// Brings a pre-accounts database up to the multi-user shape: every table that
// holds per-account data gains a user_id column.
function migrateToMultiUser() {

  let changed = false;

  for (const table of OWNED_TABLES) {
    if (tableColumns(table).includes('user_id')) continue;

    db.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER`);
    changed = true;
  }

  if (changed) {
    persist();
    console.log('Database: migrated to per-account schema (existing rows are unclaimed until the first account registers)');
  }
}

function getEngine() {
  return 'sqlite';
}

module.exports = { init, prepare, exec, getEngine };
