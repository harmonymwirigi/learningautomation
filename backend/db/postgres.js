const { Pool } = require('pg');
const { getPostgresUrl, getPostgresUrlSource } = require('./config');

let pool;

function translateSql(sql) {
  let s = sql;
  s = s.replace(/datetime\('now'\)/gi, 'NOW()');
  s = s.replace(/datetime\('now',\s*'-(\d+) days'\)/gi, "(NOW() - INTERVAL '$1 days')");
  s = s.replace(/datetime\('now',\s*'-' \|\| \? \|\| ' days'\)/gi, "(NOW() - (? || ' days')::interval)");
  s = s.replace(/date\('now'\)/gi, 'CURRENT_DATE');
  s = s.replace(/date\('now',\s*'-(\d+) days'\)/gi, "(CURRENT_DATE - INTERVAL '$1 days')");
  s = s.replace(/date\(([^)]+)\)/gi, '($1::date)');

  const boolFields = ['is_read', 'is_covered', 'completed', 'is_correct'];
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
  CREATE TABLE IF NOT EXISTS units (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    description TEXT,
    color TEXT DEFAULT '#6366f1',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS past_papers (
    id SERIAL PRIMARY KEY,
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
    unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
    duration_minutes INTEGER NOT NULL,
    notes TEXT,
    studied_at TIMESTAMPTZ DEFAULT NOW(),
    topic_name TEXT,
    session_type TEXT DEFAULT 'manual'
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'deadline',
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS training_logs (
    id SERIAL PRIMARY KEY,
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
    unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_covered BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    covered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS timetable_slots (
    id SERIAL PRIMARY KEY,
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
    unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    paper_id INTEGER REFERENCES past_papers(id) ON DELETE SET NULL,
    analysis_json TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS note_summaries (
    id SERIAL PRIMARY KEY,
    note_id INTEGER NOT NULL UNIQUE REFERENCES notes(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    key_points_json TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS quizzes (
    id SERIAL PRIMARY KEY,
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
  CREATE TABLE IF NOT EXISTS user_it_skills (
    id SERIAL PRIMARY KEY,
    skill_name TEXT NOT NULL UNIQUE,
    level TEXT DEFAULT 'intermediate',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS paper_questions (
    id SERIAL PRIMARY KEY,
    paper_id INTEGER NOT NULL REFERENCES past_papers(id) ON DELETE CASCADE,
    unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    topic TEXT,
    solution_text TEXT,
    note_refs_json TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS daily_it_lessons (
    id SERIAL PRIMARY KEY,
    lesson_date DATE NOT NULL UNIQUE,
    skill_category TEXT NOT NULL,
    title TEXT NOT NULL,
    overview TEXT,
    key_concepts_json TEXT,
    practical_task TEXT,
    resources_json TEXT,
    reflection TEXT,
    completed BOOLEAN DEFAULT false,
    duration_minutes INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  INSERT INTO user_it_skills (skill_name, level)
    VALUES ('Website Design', 'intermediate')
    ON CONFLICT (skill_name) DO NOTHING;
`;

async function ensureSchema() {
  // node-postgres runs multiple semicolon-separated statements in one call when
  // no bind params are used; this creates every table on a fresh database.
  await pool.query(SCHEMA);
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
