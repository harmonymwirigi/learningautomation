import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Field } from './AuthShell';

const OTHER = '__other__';

// School and course come from the admin-managed catalog, but the form must
// still work if that list is empty or unreachable — so every dropdown keeps an
// "Other" escape hatch, and a failed fetch degrades to plain text inputs.
export default function SchoolCoursePicker({ school, course, onChange, errors = {}, idPrefix = 'pick' }) {
  const [catalog, setCatalog] = useState(null); // null = still loading
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.schools()
      .then((list) => { if (!cancelled) setCatalog(list); })
      .catch(() => { if (!cancelled) { setCatalog([]); setFailed(true); } });
    return () => { cancelled = true; };
  }, []);

  const schools = catalog || [];
  const hasCatalog = !failed && schools.length > 0;

  // A value typed before the catalog loaded, or left over from a school an
  // admin has since removed, must not silently vanish from the form.
  const schoolListed = schools.some((s) => s.name === school);
  const [schoolOther, setSchoolOther] = useState(false);
  const showSchoolText = !hasCatalog || schoolOther || (!!school && !schoolListed);

  const selected = schools.find((s) => s.name === school);
  const courseOptions = selected?.courses || [];
  const courseListed = courseOptions.includes(course);
  const [courseOther, setCourseOther] = useState(false);
  const showCourseText = !hasCatalog || courseOther || !courseOptions.length || (!!course && !courseListed);

  const pickSchool = (value) => {
    if (value === OTHER) {
      setSchoolOther(true);
      onChange({ school: '', course: '' });
      return;
    }
    setSchoolOther(false);
    setCourseOther(false);
    // Clear the course: the old one probably belongs to the previous school.
    onChange({ school: value, course: '' });
  };

  const pickCourse = (value) => {
    if (value === OTHER) {
      setCourseOther(true);
      onChange({ school, course: '' });
      return;
    }
    setCourseOther(false);
    onChange({ school, course: value });
  };

  return (
    <>
      <Field
        label="School"
        error={errors.school}
        hint={hasCatalog ? 'e.g. School of Engineering' : 'Type your school, e.g. School of Engineering'}
      >
        {hasCatalog && !showSchoolText && (
          <select
            id={`${idPrefix}-school`}
            className="input"
            value={schoolListed ? school : ''}
            onChange={(e) => pickSchool(e.target.value)}
          >
            <option value="">Select your school</option>
            {schools.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            <option value={OTHER}>Other (not listed)</option>
          </select>
        )}
        {showSchoolText && (
          <div className="space-y-1">
            <input
              id={`${idPrefix}-school`}
              className="input"
              value={school}
              onChange={(e) => onChange({ school: e.target.value, course })}
              placeholder="School of Engineering"
            />
            {hasCatalog && (
              <button
                type="button"
                onClick={() => { setSchoolOther(false); onChange({ school: '', course: '' }); }}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                Choose from the list instead
              </button>
            )}
          </div>
        )}
      </Field>

      <Field label="Course" error={errors.course}>
        {!showCourseText && (
          <select
            id={`${idPrefix}-course`}
            className="input"
            value={courseListed ? course : ''}
            onChange={(e) => pickCourse(e.target.value)}
            disabled={!school}
          >
            <option value="">{school ? 'Select your course' : 'Pick a school first'}</option>
            {courseOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value={OTHER}>Other (not listed)</option>
          </select>
        )}
        {showCourseText && (
          <div className="space-y-1">
            <input
              id={`${idPrefix}-course`}
              className="input"
              value={course}
              onChange={(e) => onChange({ school, course: e.target.value })}
              placeholder="BSc Civil Engineering"
            />
            {courseOptions.length > 0 && (
              <button
                type="button"
                onClick={() => { setCourseOther(false); onChange({ school, course: '' }); }}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                Choose from the list instead
              </button>
            )}
          </div>
        )}
      </Field>
    </>
  );
}
