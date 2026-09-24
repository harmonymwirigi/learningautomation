// Starting set of schools and their courses, inserted only when the schools
// table is empty. An admin can rename, add to, or delete any of it afterwards —
// nothing here is re-seeded on later boots.
const DEFAULT_CATALOG = {
  'School of Engineering': [
    'BSc Civil Engineering',
    'BSc Electrical & Electronic Engineering',
    'BSc Mechanical Engineering',
    'BSc Mechatronic Engineering',
    'BSc Agricultural Engineering',
  ],
  'School of Information Technology': [
    'BSc Computer Science',
    'BSc Information Technology',
    'BSc Software Engineering',
    'BSc Data Science',
    'BSc Cybersecurity',
  ],
  'School of Business': [
    'Bachelor of Commerce',
    'Bachelor of Business Administration',
    'BSc Economics',
    'BSc Procurement & Supply Chain Management',
  ],
  'School of Education': [
    'Bachelor of Education (Arts)',
    'Bachelor of Education (Science)',
    'Bachelor of Early Childhood Education',
  ],
  'School of Health Sciences': [
    'Bachelor of Medicine & Surgery',
    'BSc Nursing',
    'BSc Public Health',
    'BSc Pharmacy',
  ],
  'School of Pure and Applied Sciences': [
    'BSc Mathematics',
    'BSc Physics',
    'BSc Chemistry',
    'BSc Biology',
  ],
  'School of Law': [
    'Bachelor of Laws (LLB)',
  ],
  'School of Agriculture': [
    'BSc Agriculture',
    'BSc Food Science & Technology',
    'BSc Horticulture',
  ],
};

module.exports = { DEFAULT_CATALOG };
