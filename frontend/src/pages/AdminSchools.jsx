import { useEffect, useState } from 'react';
import { Building2, Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import EmptyState from '../components/EmptyState';

function Banner({ error, notice }) {
  if (error) {
    return <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>;
  }
  if (notice) {
    return <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice}</div>;
  }
  return null;
}

function CourseRow({ course, onChanged, onError }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(course.name);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (name.trim() === course.name) return setEditing(false);
    setBusy(true);
    try {
      await api.admin.courses.rename(course.id, name.trim());
      setEditing(false);
      onChanged();
    } catch (err) {
      onError(err.message);
      setName(course.name);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remove "${course.name}" from the course list?`)) return;
    setBusy(true);
    try {
      await api.admin.courses.remove(course.id);
      onChanged();
    } catch (err) {
      onError(err.message);
      setBusy(false);
    }
  };

  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-800/50">
      {editing ? (
        <>
          <input
            className="input py-1 text-sm"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') { setName(course.name); setEditing(false); }
            }}
          />
          <button onClick={save} disabled={busy} className="p-1 text-emerald-400 hover:text-emerald-300" title="Save">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          </button>
          <button
            onClick={() => { setName(course.name); setEditing(false); }}
            className="p-1 text-slate-500 hover:text-slate-300"
            title="Cancel"
          >
            <X size={14} />
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 text-sm text-slate-300">{course.name}</span>
          <button onClick={() => setEditing(true)} className="p-1 text-slate-500 hover:text-white" title="Rename">
            <Pencil size={13} />
          </button>
          <button onClick={remove} disabled={busy} className="p-1 text-slate-500 hover:text-red-400" title="Remove">
            <Trash2 size={13} />
          </button>
        </>
      )}
    </li>
  );
}

function SchoolCard({ school, courses, onChanged, onError }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(school.name);
  const [newCourse, setNewCourse] = useState('');
  const [busy, setBusy] = useState(false);

  const rename = async () => {
    if (name.trim() === school.name) return setEditing(false);
    setBusy(true);
    try {
      await api.admin.schools.rename(school.id, name.trim());
      setEditing(false);
      onChanged(`Renamed to "${name.trim()}" — students in it were updated too`);
    } catch (err) {
      onError(err.message);
      setName(school.name);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    // Deleting only removes the option from sign-up; nobody's profile is edited.
    const warning = school.students_count > 0
      ? `Delete "${school.name}" and its ${school.courses_count} course(s)?\n\n`
        + `${school.students_count} student(s) list this school. Their profiles keep the name — `
        + 'it just stops being offered at sign-up.'
      : `Delete "${school.name}" and its ${school.courses_count} course(s)?`;
    if (!window.confirm(warning)) return;

    setBusy(true);
    try {
      await api.admin.schools.remove(school.id);
      onChanged(`Deleted "${school.name}"`);
    } catch (err) {
      onError(err.message);
      setBusy(false);
    }
  };

  const addCourse = async (e) => {
    e.preventDefault();
    if (!newCourse.trim()) return;
    setBusy(true);
    try {
      await api.admin.courses.create(school.id, newCourse.trim());
      setNewCourse('');
      onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600/20">
          <Building2 size={17} className="text-indigo-400" />
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                className="input py-1"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') rename();
                  if (e.key === 'Escape') { setName(school.name); setEditing(false); }
                }}
              />
              <button onClick={rename} disabled={busy} className="p-1 text-emerald-400 hover:text-emerald-300">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              </button>
              <button
                onClick={() => { setName(school.name); setEditing(false); }}
                className="p-1 text-slate-500 hover:text-slate-300"
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold text-white">{school.name}</h3>
              <button onClick={() => setEditing(true)} className="p-1 text-slate-500 hover:text-white" title="Rename school">
                <Pencil size={14} />
              </button>
              <button onClick={remove} disabled={busy} className="p-1 text-slate-500 hover:text-red-400" title="Delete school">
                <Trash2 size={14} />
              </button>
            </div>
          )}

          <p className="mt-0.5 text-xs text-slate-500">
            {school.courses_count} course{school.courses_count === 1 ? '' : 's'}
            {' · '}
            {school.students_count} student{school.students_count === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-0.5">
        {courses.map((c) => (
          <CourseRow key={c.id} course={c} onChanged={onChanged} onError={onError} />
        ))}
        {courses.length === 0 && <li className="px-2 py-1.5 text-sm text-slate-600">No courses yet</li>}
      </ul>

      <form onSubmit={addCourse} className="mt-3 flex gap-2">
        <input
          className="input py-1.5 text-sm"
          placeholder="Add a course…"
          value={newCourse}
          onChange={(e) => setNewCourse(e.target.value)}
        />
        <button type="submit" disabled={busy || !newCourse.trim()} className="btn-secondary px-3 py-1.5 text-sm">
          <Plus size={14} />
        </button>
      </form>
    </div>
  );
}

export default function AdminSchools() {
  const [schools, setSchools] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newSchool, setNewSchool] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (message) => {
    try {
      const [s, c] = await Promise.all([api.admin.schools.list(), api.admin.courses.list()]);
      setSchools(s);
      setCourses(c);
      setError('');
      if (message) setNotice(message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addSchool = async (e) => {
    e.preventDefault();
    if (!newSchool.trim()) return;
    setBusy(true);
    setError('');
    try {
      const created = newSchool.trim();
      await api.admin.schools.create(created);
      setNewSchool('');
      await load(`Added "${created}"`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const report = (message) => { setError(message); setNotice(''); };
  const refresh = (message) => { setError(''); setNotice(message || ''); load(); };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Schools &amp; courses</h1>
        <p className="mt-1 text-sm text-slate-400">
          These are the options students pick from when they sign up. Renaming one also updates
          every student already assigned to it.
        </p>
      </div>

      <Banner error={error} notice={notice} />

      <form onSubmit={addSchool} className="card flex flex-col gap-2 p-4 sm:flex-row">
        <input
          className="input"
          placeholder="New school name, e.g. School of IT"
          value={newSchool}
          onChange={(e) => setNewSchool(e.target.value)}
        />
        <button type="submit" disabled={busy || !newSchool.trim()} className="btn-primary justify-center whitespace-nowrap">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add school
        </button>
      </form>

      {schools.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No schools yet"
          description="Add your first school above — students need at least one to choose from when signing up."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {schools.map((s) => (
            <SchoolCard
              key={s.id}
              school={s}
              courses={courses.filter((c) => Number(c.school_id) === Number(s.id))}
              onChanged={refresh}
              onError={report}
            />
          ))}
        </div>
      )}
    </div>
  );
}
