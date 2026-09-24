const { Pool, types } = require('pg');
const { getPostgresUrl, getPostgresUrlSource } = require('./config');
const { OWNED_TABLES } = require('./ownedTables');
const { DEFAULT_CATALOG } = require('./defaultCatalog');

// Return DATE columns (OID 1082) as plain 'YYYY-MM-DD' strings, matching SQLite.
// Otherwise pg returns JS Date objects, which broke date-string logic like the
// daily streak (String(Date).slice(0,10) yields "Wed Jul 09" instead of "2026-07-09").
types.setTypeParser(1082, (v) => v);

let pool;

function translateSql(sql) {
  let s = sql;
  s = s.replace(/datetime\('now'\)/gi, 'NOW()');
  s = s.replace(/datetime\('now',\s*'-(\d+) days'\)/gi, "(NOW() - INTERVAL '$1 days')");
  s = s.replace(/datetime\('now',\s*'-' \|\| \? \|\| ' days'\)/gi, "(NOW() - (? || ' days')::interval)");
  s = s.replace(/date\('now'\)/gi, 'CURRENT_DATE');
  s = s.replace(/date\('now',\s*'-(\d+) days'\)/gi, "(CURRENT_DATE - INTERVAL '$1 days')");
  s = s.replace(/date\(([^)]+)\)/gi, '($1::date)');

  const boolFields = ['is_read', 'is_covered', 'completed', 'is_correct', 'is_active', 'is_current'];
  for (const field of boolFields) {
    s = s.replace(new RegExp(`(WHERE|AND|OR)\\s+${field}\\s*=\\s*0\\b`, 'gi'), `$1 ${field} = false`);
    s = s.replace(new RegExp(`(WHERE|AND|OR)\\s+${field}\\s*=\\s*1\\b`, 'gi'), `$1 ${field} = true`);
    s = s.replace(new RegExp(`WHEN\\s+${field}\\s*=\\s*1\\b`, 'gi'), `WHEN ${field} = true`);
    s = s.replace(new RegExp(`WHEN\\s+${field}\\s*=\\s*0\\b`, 'gi'), `WHEN ${field} = false`);
    s = s.replace(new RegExp(`SET\\s+${field}\\s*=\\s*1\\b`, 'gi'), `SET ${field} = true`);
    s = s.replace(new RegExp(`SET\\s+${field}\\s*=\\s*0\\b`, 'gi'), `SET ${field} = false`);
  }

  let i = 0;
  s = s.replace(/\?/g, () => `$${++i}`);
  return s;
}

function prepare(sql) {
  const baseSql = translateSql(sql);

  return {
    async run(...params) {
      let q = baseSql.trim();
      const isInsert = /^INSERT/i.test(q);
      if (isInsert && !/RETURNING/i.test(q)) {
        q += ' RETURNING id';
      }
      const result = await pool.query(q, params);
      return {
        lastInsertRowid: result.rows[0]?.id ?? 0,
        changes: result.rowCount ?? 0,
      };
    },
    async get(...params) {
      const result = await pool.query(baseSql, params);
      return result.rows[0];
    },
    async all(...params) {
      const result = await pool.query(baseSql, params);
      return result.rows;
    },
  };
}

async function exec(sql) {
  const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await pool.query(translateSql(stmt));
  }
}

function describeConnection(url) {
  try {
    const u = new URL(url);
    const user = decodeURIComponent(u.username || '');
    const host = u.hostname;
    const port = u.port || '5432';
    const pooler = host.includes('pooler.supabase.com');
    const hints = [];
    if (pooler && user === 'postgres') {
      hints.push('pooler host requires username postgres.[project-ref], not just "postgres"');
    }
    if (u.password === '[YOUR-PASSWORD]' || !u.password) {
      hints.push('replace [YOUR-PASSWORD] with your Supabase database password');
    }
    return { user, host, port, pooler, hints };
  } catch {
    return { user: '?', host: '?', port: '?', pooler: false, hints: ['DATABASE_URL is not a valid postgresql:// URI'] };
  }
}

// Postgres equivalent of the SQLite schema in ./sqlite.js.
// datetime/date columns become real timestamptz/date so `deadline >= NOW()` etc. work;
// the four boolean-flag columns become BOOLEAN (see boolFields in translateSql).
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    admission_number TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    school TEXT,
    course TEXT,
    year_of_study INTEGER,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    is_active BOOLEAN NOT NULL DEFAULT true,
    weekly_goal_minutes INTEGER NOT NULL DEFAULT 600,
    semesters_per_year INTEGER NOT NULL DEFAULT 2,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS schools (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, name)
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS terms (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    year_of_study INTEGER NOT NULL,
    semester INTEGER NOT NULL,
    label TEXT,
    is_current BOOLEAN NOT NULL DEFAULT false,
    started_at DATE DEFAULT CURRENT_DATE,
    ended_at DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, year_of_study, semester)
  );
  CREATE TABLE IF NOT EXISTS units (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    term_id INTEGER REFERENCES terms(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    code TEXT,
    description TEXT,
    color TEXT DEFAULT '#6366f1',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS past_papers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    year TEXT,
    semester TEXT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS assignments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    deadline TIMESTAMPTZ NOT NULL,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'pending',
    reminder_days INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS study_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    term_id INTEGER REFERENCES terms(id) ON DELETE SET NULL,
    unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
    duration_minutes INTEGER NOT NULL,
    notes TEXT,
    studied_at TIMESTAMPTZ DEFAULT NOW(),
    topic_name TEXT,
    session_type TEXT DEFAULT 'manual'
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'deadline',
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS training_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    topic TEXT NOT NULL,
    learned TEXT,
    goals TEXT,
    cursor_notes TEXT,
    rating INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS topics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_covered BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    covered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS timetable_slots (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
    label TEXT,
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS exam_analyses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    paper_id INTEGER REFERENCES past_papers(id) ON DELETE SET NULL,
    analysis_json TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS note_summaries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    note_id INTEGER NOT NULL UNIQUE REFERENCES notes(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    key_points_json TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS quizzes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS quiz_questions (
    id SERIAL PRIMARY KEY,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type TEXT DEFAULT 'mcq',
    options_json TEXT,
    correct_answer TEXT NOT NULL,
    topic TEXT,
    sort_order INTEGER DEFAULT 0,
    source_paper TEXT,
    note_refs_json TEXT
  );
  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    total INTEGER DEFAULT 0,
    weak_topics_json TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  );
  CREATE TABLE IF NOT EXISTS quiz_answers (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    user_answer TEXT,
    is_correct BOOLEAN DEFAULT false,
    ai_feedback TEXT,
    score REAL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS topic_weakness (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    topic_name TEXT NOT NULL,
    weakness_score INTEGER DEFAULT 1,
    source TEXT DEFAULT 'quiz',
    last_assessed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(unit_id, topic_name)
  );
  CREATE TABLE IF NOT EXISTS whatsapp_log (
    id SERIAL PRIMARY KEY,
    message_key TEXT NOT NULL UNIQUE,
    message_preview TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS paper_questions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    paper_id INTEGER NOT NULL REFERENCES past_papers(id) ON DELETE CASCADE,
    unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    topic TEXT,
    solution_text TEXT,
    note_refs_json TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

// Brings a pre-accounts database up to the multi-user shape: every owned table
// gains user_id, and the two single-user UNIQUE constraints widen to include it.
const MIGRATION = `
  ${OWNED_TABLES.map((t) =>
    `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;`
  ).join('\n  ')}
  ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_goal_minutes INTEGER NOT NULL DEFAULT 600;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS semesters_per_year INTEGER NOT NULL DEFAULT 2;
  ALTER TABLE units ADD COLUMN IF NOT EXISTS term_id INTEGER REFERENCES terms(id) ON DELETE SET NULL;
  ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS term_id INTEGER REFERENCES terms(id) ON DELETE SET NULL;
  ${OWNED_TABLES.map((t) =>
    `CREATE INDEX IF NOT EXISTS ${t}_user_id_idx ON ${t} (user_id);`
  ).join('\n  ')}
`;

async function ensureSchema() {
  // node-postgres runs multiple semicolon-separated statements in one call when
  // no bind params are used; this creates every table on a fresh database.
  await pool.query(SCHEMA);
  await pool.query(MIGRATION);
  await seedSchools();
}

// Only ever runs against an empty schools table, so an admin's edits and
// deletions are never undone by a restart.
async function seedSchools() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM schools');
  if (rows[0].count > 0) return;

  for (const [school, courses] of Object.entries(DEFAULT_CATALOG)) {
    const inserted = await pool.query('INSERT INTO schools (name) VALUES ($1) RETURNING id', [school]);
    const schoolId = inserted.rows[0].id;
    for (const course of courses) {
      await pool.query('INSERT INTO courses (school_id, name) VALUES ($1, $2)', [schoolId, course]);
    }
  }
  console.log(`Database: seeded ${Object.keys(DEFAULT_CATALOG).length} default schools`);
}

async function init() {
  const url = getPostgresUrl();
  if (!url) throw new Error('SUPABASE_DATABASE_URL or DATABASE_URL is required for Postgres');

  const info = describeConnection(url);
  const source = getPostgresUrlSource();
  pool = new Pool({
    connectionString: url,
    ssl: url.includes('supabase') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await pool.query('SELECT 1');
  } catch (err) {
    if (err.code === '28P01') {
      const hint = info.hints.length
        ? info.hints.join('; ')
        : 'reset the database password in Supabase → Settings → Database, then update DATABASE_URL on Render';
      throw new Error(
        `Postgres login failed for user "${info.user}" @ ${info.host}:${info.port}. ${hint}`
      );
    }
    throw err;
  }
  await ensureSchema();
  console.log(`Database: Postgres connected (${info.host}:${info.port}, via ${source})`);
}

function getEngine() {
  return 'postgres';
}

module.exports = { init, prepare, exec, getEngine };
