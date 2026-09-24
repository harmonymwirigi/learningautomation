import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Field, FormError } from '../components/AuthShell';
import SchoolCoursePicker from '../components/SchoolCoursePicker';
import ProfileProgressHeader from '../components/ProfileProgressHeader';
import { YEARS } from '../constants/academics';

function Notice({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
      <Check size={16} /> {message}
    </div>
  );
}

function ProfileForm() {
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState({
    full_name: user.full_name || '',
    admission_number: user.admission_number || '',
    email: user.email || '',
    phone: user.phone || '',
    school: user.school || '',
    course: user.course || '',
    year_of_study: user.year_of_study ?? '',
    weekly_goal_minutes: user.weekly_goal_minutes ?? 600,
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    setSaved('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setErrors({});
    setSaving(true);
    try {
      await updateProfile({
        ...form,
        year_of_study: Number(form.year_of_study),
        weekly_goal_minutes: Number(form.weekly_goal_minutes),
      });
      setSaved('Profile updated');
    } catch (err) {
      if (err.field) setErrors({ [err.field]: err.message });
      else setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-6" noValidate>
      <h2 className="text-lg font-semibold text-white">Your details</h2>

      <FormError message={formError} />
      <Notice message={saved} />

      <Field label="Full name" error={errors.full_name}>
        <input className="input" value={form.full_name} onChange={set('full_name')} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Student / admission number" error={errors.admission_number}>
          <input className="input" value={form.admission_number} onChange={set('admission_number')} />
        </Field>
        <Field label="Email address" error={errors.email}>
          <input className="input" type="email" value={form.email} onChange={set('email')} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone number" error={errors.phone}>
          <input className="input" type="tel" value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Year of study" error={errors.year_of_study}>
          <select className="input" value={form.year_of_study} onChange={set('year_of_study')}>
            <option value="">Select year</option>
            {YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </Field>
      </div>

      <SchoolCoursePicker
        idPrefix="profile"
        school={form.school}
        course={form.course}
        errors={errors}
        onChange={({ school, course }) => {
          setForm((f) => ({ ...f, school, course }));
          setErrors((prev) => ({ ...prev, school: undefined, course: undefined }));
          setSaved('');
        }}
      />

      <Field
        label="Weekly study goal"
        error={errors.weekly_goal_minutes}
        hint="Sets the target your study progress is measured against"
      >
        <select className="input" value={form.weekly_goal_minutes} onChange={set('weekly_goal_minutes')}>
          {[120, 180, 300, 420, 600, 900, 1200, 1800].map((m) => (
            <option key={m} value={m}>
              {m / 60} hours a week{m === 600 ? ' (default)' : ''}
            </option>
          ))}
        </select>
      </Field>

      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Save changes'}
      </button>
    </form>
  );
}

function PasswordForm() {
  const { changePassword } = useAuth();
  const [form, setForm] = useState({ current_password: '', password: '', confirm_password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    setSaved('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setErrors({});

    if (form.password !== form.confirm_password) {
      setErrors({ confirm_password: 'Passwords do not match' });
      return;
    }

    setSaving(true);
    try {
      await changePassword(form);
      setForm({ current_password: '', password: '', confirm_password: '' });
      setSaved('Password changed');
    } catch (err) {
      if (err.field) setErrors({ [err.field]: err.message });
      else setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-6" noValidate>
      <h2 className="text-lg font-semibold text-white">Change password</h2>

      <FormError message={formError} />
      <Notice message={saved} />

      <Field label="Current password" error={errors.current_password}>
        <input
          className="input" type="password" value={form.current_password}
          onChange={set('current_password')} autoComplete="current-password"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" error={errors.password} hint="At least 8 characters, with a letter and a number">
          <input
            className="input" type="password" value={form.password}
            onChange={set('password')} autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm new password" error={errors.confirm_password}>
          <input
            className="input" type="password" value={form.confirm_password}
            onChange={set('confirm_password')} autoComplete="new-password"
          />
        </Field>
      </div>

      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? <><Loader2 size={16} className="animate-spin" /> Updating…</> : 'Update password'}
      </button>
    </form>
  );
}

export default function Profile() {
  const { user, signOut } = useAuth();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ProfileProgressHeader user={user} onSignOut={signOut} />

      <ProfileForm />
      <PasswordForm />
    </div>
  );
}
