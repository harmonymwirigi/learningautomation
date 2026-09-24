const db = require('../db');
const { ValidationError } = require('./users');

// A term is one semester of one year of study. Units belong to a term, and
// everything else hangs off units — so "progress this semester" is just
// progress over the units in the current term. Past terms keep their data and
// their score, which is the whole point of advancing rather than resetting.

const num = (value) => Number(value) || 0;

function displayName(term) {
  if (term.label) return term.label;
  return `Year ${term.year_of_study} · Semester ${term.semester}`;
}

function decorate(term) {
  if (!term) return null;

  return {
    ...term,
    year_of_study: num(term.year_of_study),
    semester: num(term.semester),
    is_current: !!term.is_current,
    name: displayName(term),
  };
}

function validate(yearOfStudy, semester, semestersPerYear = 2) {
  const year = Number(yearOfStudy);
  const sem = Number(semester);

  if (!Number.isInteger(year) || year < 1 || year > 8) {
    throw new ValidationError(
      'Year of study must be between 1 and 8',
      'year_of_study',
    );
  }

  const maxSemester = Math.max(2, Number(semestersPerYear) || 2);

  if (!Number.isInteger(sem) || sem < 1 || sem > maxSemester) {
    throw new ValidationError(
      `Semester must be between 1 and ${maxSemester}`,
      'semester',
    );
  }

  return { year, sem };
}

async function listTerms(userId) {
  const terms = await db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM units WHERE term_id = t.id) AS units_count
    FROM terms t
    WHERE t.user_id = ?
    ORDER BY t.year_of_study, t.semester
  `).all(userId);

  return terms.map((t) => ({
    ...decorate(t),
    units_count: num(t.units_count),
  }));
}

async function getCurrent(userId) {
  const term = await db.prepare(
    'SELECT * FROM terms WHERE user_id = ? AND is_current = true',
  ).get(userId);

  return decorate(term);
}

async function findTerm(id, userId) {
  const term = await db.prepare(
    'SELECT * FROM terms WHERE id = ? AND user_id = ?',
  ).get(id, userId);

  if (!term) {
    throw new ValidationError('Semester not found', 'id');
  }

  return decorate(term);
}

// Exactly one term is current per account; activating one clears the rest.
async function activate(termId, userId) {
  await findTerm(termId, userId);

  await db.prepare(
    'UPDATE terms SET is_current = false WHERE user_id = ?',
  ).run(userId);

  await db.prepare(
    'UPDATE terms SET is_current = true WHERE id = ? AND user_id = ?',
  ).run(termId, userId);

  return findTerm(termId, userId);
}

async function createTerm(
  userId,
  { year_of_study, semester, label, make_current = true },
  semestersPerYear = 2,
) {
  const { year, sem } = validate(
    year_of_study,
    semester,
    semestersPerYear,
  );

  const clash = await db.prepare(
    'SELECT id FROM terms WHERE user_id = ? AND year_of_study = ? AND semester = ?',
  ).get(userId, year, sem);

  if (clash) {
    throw new ValidationError(
      `You already have a Year ${year} Semester ${sem}`,
      'semester',
    );
  }

  const result = await db.prepare(`
    INSERT INTO terms (
      user_id,
      year_of_study,
      semester,
      label,
      is_current
    )
    VALUES (?, ?, ?, ?, false)
  `).run(
    userId,
    year,
    sem,
    label?.trim() || null,
  );

  const id = result.lastInsertRowid;

  if (make_current) {
    // Close off whatever was running, so the old term has an end date.
    await db.prepare(
      "UPDATE terms SET ended_at = date('now') WHERE user_id = ? AND is_current = true AND ended_at IS NULL",
    ).run(userId);

    return activate(id, userId);
  }

  return findTerm(id, userId);
}

// What "Start next semester" means: step within the year until the year is
// full, then roll over to semester 1 of the next year.
function nextAfter(term, semestersPerYear = 2) {
  const perYear = Math.max(2, Number(semestersPerYear) || 2);

  if (!term) {
    return {
      year_of_study: 1,
      semester: 1,
    };
  }

  if (term.semester < perYear) {
    return {
      year_of_study: term.year_of_study,
      semester: term.semester + 1,
    };
  }

  return {
    year_of_study: term.year_of_study + 1,
    semester: 1,
  };
}

async function startNext(userId, semestersPerYear = 2) {
  const current = await getCurrent(userId);
  const next = nextAfter(current, semestersPerYear);

  const existing = await db.prepare(
    'SELECT id FROM terms WHERE user_id = ? AND year_of_study = ? AND semester = ?',
  ).get(
    userId,
    next.year_of_study,
    next.semester,
  );

  if (existing) {
    return activate(existing.id, userId);
  }

  return createTerm(userId, next, semestersPerYear);
}

async function updateTerm(
  termId,
  userId,
  input,
  semestersPerYear = 2,
) {
  const existing = await findTerm(termId, userId);

  const { year, sem } = validate(
    input.year_of_study ?? existing.year_of_study,
    input.semester ?? existing.semester,
    semestersPerYear,
  );

  const clash = await db.prepare(
    'SELECT id FROM terms WHERE user_id = ? AND year_of_study = ? AND semester = ? AND id != ?',
  ).get(
    userId,
    year,
    sem,
    termId,
  );

  if (clash) {
    throw new ValidationError(
      `You already have a Year ${year} Semester ${sem}`,
      'semester',
    );
  }

  const label =
    input.label === undefined
      ? existing.label
      : (input.label?.trim() || null);

  await db.prepare(
    'UPDATE terms SET year_of_study = ?, semester = ?, label = ? WHERE id = ? AND user_id = ?',
  ).run(
    year,
    sem,
    label,
    termId,
    userId,
  );

  return findTerm(termId, userId);
}

// Refused while the term still holds units: deleting would orphan a whole
// semester of work, and moving those units is a decision only the student
// should make.
async function deleteTerm(termId, userId) {
  const term = await findTerm(termId, userId);

  const { count } = await db.prepare(
    'SELECT COUNT(*) AS count FROM units WHERE term_id = ?',
  ).get(termId);

  if (num(count) > 0) {
    throw new ValidationError(
      `${term.name} still has ${num(count)} unit(s). Move or delete them first.`,
      'id',
    );
  }

  const { count: total } = await db.prepare(
    'SELECT COUNT(*) AS count FROM terms WHERE user_id = ?',
  ).get(userId);

  if (num(total) <= 1) {
    throw new ValidationError(
      'You need at least one semester',
      'id',
    );
  }

  await db.prepare(
    'DELETE FROM terms WHERE id = ? AND user_id = ?',
  ).run(termId, userId);

  if (term.is_current) {
    const fallback = await db.prepare(
      'SELECT id FROM terms WHERE user_id = ? ORDER BY year_of_study DESC, semester DESC LIMIT 1',
    ).get(userId);

    if (fallback) {
      await activate(fallback.id, userId);
    }
  }

  return {
    success: true,
  };
}

// Every account needs a current term for new units to land in. Called at
// registration and defensively before anything reads the current term, so an
// account upgraded from an older version is repaired on first use.
async function ensureCurrent(userId, yearOfStudy = 1) {
  const current = await getCurrent(userId);

  if (current) {
    return current;
  }

  const any = await db.prepare(
    'SELECT id FROM terms WHERE user_id = ? ORDER BY year_of_study DESC, semester DESC LIMIT 1',
  ).get(userId);

  if (any) {
    return activate(any.id, userId);
  }

  const year = Number(yearOfStudy) >= 1
    ? Number(yearOfStudy)
    : 1;

  const created = await createTerm(
    userId,
    {
      year_of_study: year,
      semester: 1,
    },
  );

  // Anything recorded before terms existed belongs to the term that replaces
  // "no term" — otherwise it would silently disappear from every view.
  await db.prepare(
    'UPDATE units SET term_id = ? WHERE user_id = ? AND term_id IS NULL',
  ).run(created.id, userId);

  await db.prepare(
    'UPDATE study_sessions SET term_id = ? WHERE user_id = ? AND term_id IS NULL',
  ).run(created.id, userId);

  return created;
}

module.exports = {
  listTerms,
  getCurrent,
  findTerm,
  createTerm,
  startNext,
  activate,
  updateTerm,
  deleteTerm,
  ensureCurrent,
  nextAfter,
  displayName,
};