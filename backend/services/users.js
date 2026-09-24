const db = require('../db');
const { OWNED_TABLES } = require('../db/ownedTables');
const { hashPassword, verifyPassword } = require('./auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9][0-9\s-]{6,19}$/;

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.field = field;
    this.status = 400;
  }
}

// Only these ever leave the server — password_hash must never reach a client.
const PUBLIC_COLUMNS = 'id, full_name, admission_number, email, phone, school, course, '
  + 'year_of_study, role, is_active, weekly_goal_minutes, created_at';

function toPublic(row) {
  if (!row) return null;
  const { password_hash, ...safe } = row;
  return {
    ...safe,
    year_of_study: safe.year_of_study == null ? null : Number(safe.year_of_study),
    // SQLite stores this flag as 0/1 and Postgres as a boolean; clients get a boolean.
    is_active: safe.is_active === undefined ? true : !!safe.is_active,
    role: safe.role || 'student',
    weekly_goal_minutes: Number(safe.weekly_goal_minutes) || 600,
  };
}

function isAdmin(user) {
  return user?.role === 'admin';
}

function validateProfile(input, { partial = false } = {}) {
  const out = {};

  const text = (key, label, { min = 2, max = 120, required = true } = {}) => {
    const raw = input[key];
    if (raw === undefined && partial) return;
    const value = String(raw ?? '').trim();
    if (!value) {
      if (required) throw new ValidationError(`${label} is required`, key);
      out[key] = null;
      return;
    }
    if (value.length < min) throw new ValidationError(`${label} must be at least ${min} characters`, key);
    if (value.length > max) throw new ValidationError(`${label} must be under ${max} characters`, key);
    out[key] = value;
  };

  text('full_name', 'Full name', { min: 3, max: 120 });
  text('school', 'School', { min: 2, max: 120 });
  text('course', 'Course', { min: 2, max: 120 });

  if (!(partial && input.admission_number === undefined)) {
    const admission = String(input.admission_number ?? '').trim().toUpperCase();
    if (!admission) throw new ValidationError('Student/admission number is required', 'admission_number');
    if (admission.length > 40) throw new ValidationError('Admission number is too long', 'admission_number');
    out.admission_number = admission;
  }

  if (!(partial && input.email === undefined)) {
    const email = String(input.email ?? '').trim().toLowerCase();
    if (!email) throw new ValidationError('Email address is required', 'email');
    if (!EMAIL_RE.test(email)) throw new ValidationError('Enter a valid email address', 'email');
    out.email = email;
  }

  if (!(partial && input.phone === undefined)) {
    const phone = String(input.phone ?? '').trim();
    if (!phone) throw new ValidationError('Phone number is required', 'phone');
    if (!PHONE_RE.test(phone)) throw new ValidationError('Enter a valid phone number, e.g. +254712345678', 'phone');
    out.phone = phone;
  }

  if (input.weekly_goal_minutes !== undefined) {
    const goal = Number(input.weekly_goal_minutes);
    if (!Number.isInteger(goal) || goal < 30 || goal > 10080) {
      throw new ValidationError('Weekly study goal must be between 30 minutes and 7 days', 'weekly_goal_minutes');
    }
    out.weekly_goal_minutes = goal;
  }

  if (!(partial && input.year_of_study === undefined)) {
    const year = Number(input.year_of_study);
    if (!Number.isInteger(year) || year < 1 || year > 8) {
      throw new ValidationError('Year of study must be between 1 and 8', 'year_of_study');
    }
    out.year_of_study = year;
  }

  return out;
}

function validatePassword(password, confirmPassword) {
  const value = String(password ?? '');
  if (!value) throw new ValidationError('Password is required', 'password');
  if (value.length < 8) throw new ValidationError('Password must be at least 8 characters', 'password');
  if (value.length > 200) throw new ValidationError('Password is too long', 'password');
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    throw new ValidationError('Password must contain at least one letter and one number', 'password');
  }
  if (confirmPassword !== undefined && value !== String(confirmPassword ?? '')) {
    throw new ValidationError('Passwords do not match', 'confirm_password');
  }
  return value;
}

async function findById(id) {
  return db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(id);
}

async function findByLogin(identifier) {
  const value = String(identifier ?? '').trim();
  if (!value) return undefined;
  return db.prepare(`
    SELECT * FROM users
    WHERE LOWER(email) = LOWER(?) OR UPPER(admission_number) = UPPER(?)
  `).get(value, value);
}

async function countUsers() {
  const row = await db.prepare('SELECT COUNT(*) AS count FROM users').get();
  return Number(row.count);
}

// A database that predates accounts still holds the original owner's units,
// notes and so on with user_id NULL. The first account to register adopts them,
// so upgrading the app never looks like data loss.
async function claimUnownedData(userId) {
  let claimed = 0;
  for (const table of OWNED_TABLES) {
    const result = await db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`).run(userId);
    claimed += result.changes || 0;
  }
  return claimed;
}

async function register(input) {
  const profile = validateProfile(input);
  const password = validatePassword(input.password, input.confirm_password ?? input.confirmPassword);

  const emailTaken = await db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(profile.email);
  if (emailTaken) throw new ValidationError('An account with this email already exists', 'email');

  const admissionTaken = await db.prepare('SELECT id FROM users WHERE UPPER(admission_number) = UPPER(?)')
    .get(profile.admission_number);
  if (admissionTaken) {
    throw new ValidationError('An account with this admission number already exists', 'admission_number');
  }

  const isFirstUser = (await countUsers()) === 0;

  const result = await db.prepare(`
    INSERT INTO users (full_name, admission_number, email, phone, school, course, year_of_study, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    profile.full_name, profile.admission_number, profile.email, profile.phone,
    profile.school, profile.course, profile.year_of_study, hashPassword(password),
  );

  const userId = result.lastInsertRowid;

  if (isFirstUser) {
    const claimed = await claimUnownedData(userId);
    if (claimed) console.log(`Claimed ${claimed} pre-existing record(s) for the first account (${profile.email})`);
  }

  // Requiring terms lazily avoids a cycle: terms.js imports ValidationError from here.
  await require('./terms').ensureCurrent(userId, profile.year_of_study);

  return toPublic(await findById(userId));
}

async function login(identifier, password) {
  const user = await findByLogin(identifier);
  // Same message either way, so the response cannot be used to enumerate accounts.
  const invalid = new ValidationError('Invalid login details. Check your email/admission number and password.', 'identifier');
  if (!user) throw invalid;
  if (!verifyPassword(String(password ?? ''), user.password_hash)) throw invalid;
  if (!user.is_active) {
    throw new ValidationError('This account has been suspended. Contact your administrator.', 'identifier');
  }
  return toPublic(user);
}

async function updateProfile(userId, input) {
  const existing = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!existing) throw new ValidationError('Account not found', 'id');

  const profile = validateProfile(input, { partial: true });

  if (profile.email && profile.email !== existing.email) {
    const taken = await db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?')
      .get(profile.email, userId);
    if (taken) throw new ValidationError('An account with this email already exists', 'email');
  }

  if (profile.admission_number && profile.admission_number !== existing.admission_number) {
    const taken = await db.prepare('SELECT id FROM users WHERE UPPER(admission_number) = UPPER(?) AND id != ?')
      .get(profile.admission_number, userId);
    if (taken) throw new ValidationError('An account with this admission number already exists', 'admission_number');
  }

  const merged = { ...existing, ...profile };
  await db.prepare(`
    UPDATE users SET full_name = ?, admission_number = ?, email = ?, phone = ?,
      school = ?, course = ?, year_of_study = ?, weekly_goal_minutes = ?
    WHERE id = ?
  `).run(
    merged.full_name, merged.admission_number, merged.email, merged.phone,
    merged.school, merged.course, merged.year_of_study,
    merged.weekly_goal_minutes || 600, userId,
  );

  return toPublic(await findById(userId));
}

async function changePassword(userId, { current_password, password, confirm_password }) {
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw new ValidationError('Account not found', 'id');

  if (!verifyPassword(String(current_password ?? ''), user.password_hash)) {
    throw new ValidationError('Your current password is incorrect', 'current_password');
  }

  const next = validatePassword(password, confirm_password);
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), userId);
  return { success: true };
}


// ── Admin operations ───────────────────────────────────────────────────────
// Every function here is reached only through requireAdmin. The guards below
// exist so an admin cannot lock themselves — or everybody — out of the system.

async function countAdmins() {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1").get();
  return Number(row.count);
}

function assertNotSelf(targetId, actingAdminId, action) {
  if (Number(targetId) === Number(actingAdminId)) {
    throw new ValidationError(`You cannot ${action} your own account`, 'id');
  }
}

// Refuses to remove the last way in. Without this, demoting or suspending the
// only admin would leave the deployment with no one able to manage it.
async function assertNotLastAdmin(target, action) {
  if (target.role !== 'admin' || !target.is_active) return;
  if ((await countAdmins()) <= 1) {
    throw new ValidationError(`You cannot ${action} the only remaining admin`, 'id');
  }
}

async function requireUser(id) {
  const user = await db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(id);
  if (!user) throw new ValidationError('Account not found', 'id');
  return toPublic(user);
}

async function listUsers({ search = '', role = '', status = '' } = {}) {
  const clauses = [];
  const params = [];

  const term = String(search).trim();
  if (term) {
    clauses.push('(LOWER(full_name) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?) '
      + 'OR UPPER(admission_number) LIKE UPPER(?) OR LOWER(school) LIKE LOWER(?) OR LOWER(course) LIKE LOWER(?))');
    const like = `%${term}%`;
    params.push(like, like, like, like, like);
  }
  if (role === 'admin' || role === 'student') {
    clauses.push('role = ?');
    params.push(role);
  }
  if (status === 'active') clauses.push('is_active = 1');
  if (status === 'suspended') clauses.push('is_active = 0');

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = await db.prepare(`
    SELECT ${PUBLIC_COLUMNS},
      (SELECT COUNT(*) FROM units WHERE user_id = users.id) AS units_count,
      (SELECT COUNT(*) FROM notes WHERE user_id = users.id) AS notes_count,
      (SELECT COUNT(*) FROM assignments WHERE user_id = users.id) AS assignments_count
    FROM users
    ${where}
    ORDER BY created_at DESC, id DESC
  `).all(...params);

  return rows.map((row) => ({
    ...toPublic(row),
    units_count: Number(row.units_count),
    notes_count: Number(row.notes_count),
    assignments_count: Number(row.assignments_count),
  }));
}

async function getStats() {
  const one = async (sql) => Number((await db.prepare(sql).get()).count);
  return {
    total_users: await one('SELECT COUNT(*) AS count FROM users'),
    admins: await one("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'"),
    suspended: await one('SELECT COUNT(*) AS count FROM users WHERE is_active = 0'),
    schools: await one('SELECT COUNT(*) AS count FROM schools'),
    courses: await one('SELECT COUNT(*) AS count FROM courses'),
    units: await one('SELECT COUNT(*) AS count FROM units'),
    notes: await one('SELECT COUNT(*) AS count FROM notes'),
  };
}

async function setRole(targetId, role, actingAdminId) {
  if (role !== 'admin' && role !== 'student') {
    throw new ValidationError("Role must be either 'admin' or 'student'", 'role');
  }
  const target = await requireUser(targetId);
  assertNotSelf(targetId, actingAdminId, 'change the role of');
  if (role === 'student') await assertNotLastAdmin(target, 'demote');

  await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);
  return requireUser(targetId);
}

async function setActive(targetId, active, actingAdminId) {
  const target = await requireUser(targetId);
  assertNotSelf(targetId, actingAdminId, 'suspend');
  if (!active) await assertNotLastAdmin(target, 'suspend');

  // Written as a literal, not a bind param: the Postgres driver rewrites
  // `is_active = 1` to `= true`, but cannot rewrite a value it never sees.
  const sql = active
    ? 'UPDATE users SET is_active = 1 WHERE id = ?'
    : 'UPDATE users SET is_active = 0 WHERE id = ?';
  await db.prepare(sql).run(targetId);
  return requireUser(targetId);
}

// Used when a student is locked out. The admin sets a temporary password and
// passes it on; there is no email delivery in this app.
async function adminResetPassword(targetId, password) {
  await requireUser(targetId);
  const next = validatePassword(password);
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), targetId);
  return { success: true };
}

async function adminUpdateProfile(targetId, input) {
  await requireUser(targetId);
  return updateProfile(targetId, input);
}

// Deleting an account deletes everything that belongs to it. Postgres cascades
// on its own; SQLite has foreign keys off in sql.js, so clear the rows here.
async function deleteUser(targetId, actingAdminId) {
  const target = await requireUser(targetId);
  assertNotSelf(targetId, actingAdminId, 'delete');
  await assertNotLastAdmin(target, 'delete');

  for (const table of OWNED_TABLES) {
    await db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(targetId);
  }
  await db.prepare('DELETE FROM users WHERE id = ?').run(targetId);

  return { success: true, deleted: target };
}

// Promotes accounts listed in ADMIN_EMAILS at boot, so a fresh deployment has a
// way in without shell access. Demotion is never automatic.
async function syncAdminsFromEnv() {
  const raw = process.env.ADMIN_EMAILS || '';
  const emails = raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!emails.length) return [];

  const promoted = [];
  for (const email of emails) {
    const result = await db.prepare(
      "UPDATE users SET role = 'admin' WHERE LOWER(email) = LOWER(?) AND role != 'admin'",
    ).run(email);
    if (result.changes) promoted.push(email);
  }
  return promoted;
}

module.exports = {
  ValidationError,
  register,
  login,
  findById,
  updateProfile,
  changePassword,
  claimUnownedData,
  countUsers,
  toPublic,
  isAdmin,
  listUsers,
  getStats,
  setRole,
  setActive,
  adminResetPassword,
  adminUpdateProfile,
  deleteUser,
  countAdmins,
  syncAdminsFromEnv,
};
