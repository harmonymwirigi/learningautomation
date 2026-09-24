const db = require('../db');
const { ValidationError } = require('./users');

function cleanName(raw, label, max = 120) {
  const value = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!value) throw new ValidationError(`${label} is required`, 'name');
  if (value.length < 2) throw new ValidationError(`${label} is too short`, 'name');
  if (value.length > max) throw new ValidationError(`${label} must be under ${max} characters`, 'name');
  return value;
}

// ── Schools ────────────────────────────────────────────────────────────────

async function listSchools() {
  const schools = await db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM courses WHERE school_id = s.id) AS courses_count,
      (SELECT COUNT(*) FROM users WHERE LOWER(users.school) = LOWER(s.name)) AS students_count
    FROM schools s ORDER BY s.name
  `).all();

  return schools.map((s) => ({
    ...s,
    courses_count: Number(s.courses_count),
    students_count: Number(s.students_count),
  }));
}

// What the sign-up form needs: every school with its courses nested, so the
// course list can narrow as soon as a school is picked.
async function getCatalog() {
  const schools = await db.prepare('SELECT id, name FROM schools ORDER BY name').all();
  const courses = await db.prepare('SELECT id, school_id, name FROM courses ORDER BY name').all();

  return schools.map((school) => ({
    ...school,
    courses: courses.filter((c) => Number(c.school_id) === Number(school.id)).map((c) => c.name),
  }));
}

async function findSchool(id) {
  const school = await db.prepare('SELECT * FROM schools WHERE id = ?').get(id);
  if (!school) throw new ValidationError('School not found', 'id');
  return school;
}

async function createSchool(input) {
  const name = cleanName(input.name, 'School name');

  const taken = await db.prepare('SELECT id FROM schools WHERE LOWER(name) = LOWER(?)').get(name);
  if (taken) throw new ValidationError('A school with this name already exists', 'name');

  const result = await db.prepare('INSERT INTO schools (name) VALUES (?)').run(name);
  return db.prepare('SELECT * FROM schools WHERE id = ?').get(result.lastInsertRowid);
}

// Renaming carries the students across too, otherwise every profile would
// still name a school that no longer exists.
async function renameSchool(id, input) {
  const existing = await findSchool(id);
  const name = cleanName(input.name, 'School name');

  const taken = await db.prepare('SELECT id FROM schools WHERE LOWER(name) = LOWER(?) AND id != ?').get(name, id);
  if (taken) throw new ValidationError('A school with this name already exists', 'name');

  await db.prepare('UPDATE schools SET name = ? WHERE id = ?').run(name, id);
  await db.prepare('UPDATE users SET school = ? WHERE LOWER(school) = LOWER(?)').run(name, existing.name);

  return db.prepare('SELECT * FROM schools WHERE id = ?').get(id);
}

// Students keep the school name already on their profile — deleting an entry
// removes it from the sign-up list, it does not edit anybody's record.
async function deleteSchool(id) {
  const school = await findSchool(id);
  await db.prepare('DELETE FROM courses WHERE school_id = ?').run(id);
  await db.prepare('DELETE FROM schools WHERE id = ?').run(id);
  return { success: true, deleted: school };
}

// ── Courses ────────────────────────────────────────────────────────────────

async function listCourses(schoolId) {
  if (schoolId) {
    return db.prepare(`
      SELECT c.*, s.name AS school_name
      FROM courses c LEFT JOIN schools s ON c.school_id = s.id
      WHERE c.school_id = ? ORDER BY c.name
    `).all(schoolId);
  }
  return db.prepare(`
    SELECT c.*, s.name AS school_name
    FROM courses c LEFT JOIN schools s ON c.school_id = s.id
    ORDER BY s.name, c.name
  `).all();
}

async function createCourse(input) {
  const name = cleanName(input.name, 'Course name');
  const schoolId = Number(input.school_id);
  if (!Number.isInteger(schoolId) || schoolId < 1) {
    throw new ValidationError('Choose the school this course belongs to', 'school_id');
  }
  await findSchool(schoolId);

  const taken = await db.prepare(
    'SELECT id FROM courses WHERE school_id = ? AND LOWER(name) = LOWER(?)',
  ).get(schoolId, name);
  if (taken) throw new ValidationError('This school already has a course with that name', 'name');

  const result = await db.prepare('INSERT INTO courses (school_id, name) VALUES (?, ?)').run(schoolId, name);
  return db.prepare('SELECT * FROM courses WHERE id = ?').get(result.lastInsertRowid);
}

async function renameCourse(id, input) {
  const existing = await db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
  if (!existing) throw new ValidationError('Course not found', 'id');

  const name = cleanName(input.name, 'Course name');
  const taken = await db.prepare(
    'SELECT id FROM courses WHERE school_id = ? AND LOWER(name) = LOWER(?) AND id != ?',
  ).get(existing.school_id, name, id);
  if (taken) throw new ValidationError('This school already has a course with that name', 'name');

  await db.prepare('UPDATE courses SET name = ? WHERE id = ?').run(name, id);
  await db.prepare('UPDATE users SET course = ? WHERE LOWER(course) = LOWER(?)').run(name, existing.name);

  return db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
}

async function deleteCourse(id) {
  const result = await db.prepare('DELETE FROM courses WHERE id = ?').run(id);
  if (!result.changes) throw new ValidationError('Course not found', 'id');
  return { success: true };
}

module.exports = {
  listSchools,
  getCatalog,
  createSchool,
  renameSchool,
  deleteSchool,
  listCourses,
  createCourse,
  renameCourse,
  deleteCourse,
};
