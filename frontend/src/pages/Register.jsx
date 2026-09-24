import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AuthShell, { Field, FormError } from '../components/AuthShell';
import SchoolCoursePicker from '../components/SchoolCoursePicker';
import { YEARS } from '../constants/academics';

const EMPTY = {
  full_name: '',
  admission_number: '',
  email: '',
  phone: '',
  school: '',
  course: '',
  year_of_study: '',
  password: '',
  confirm_password: '',
};

// Mirrors the server's rules so mistakes are caught before a round trip; the
// server still validates everything again, because this is only a convenience.
function validate(form) {
  const errors = {};

  if (form.full_name.trim().length < 3) errors.full_name = 'Enter your full name';
  if (!form.admission_number.trim()) errors.admission_number = 'Student/admission number is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) errors.email = 'Enter a valid email address';
  if (!/^\+?[0-9][0-9\s-]{6,19}$/.test(form.phone.trim())) errors.phone = 'Enter a valid phone number, e.g. +254712345678';
  if (form.school.trim().length < 2) errors.school = 'Enter your school, e.g. School of Engineering';
  if (form.course.trim().length < 2) errors.course = 'Enter your course';
  if (!form.year_of_study) errors.year_of_study = 'Select your year of study';

  if (form.password.length < 8) {
    errors.password = 'Password must be at least 8 characters';
  } else if (!/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password)) {
    errors.password = 'Password must contain at least one letter and one number';
  }

  if (form.confirm_password !== form.password) errors.confirm_password = 'Passwords do not match';

  return errors;
}

export default function Register() {
  const { user, signUp } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      await signUp({ ...form, year_of_study: Number(form.year_of_study) });
      navigate('/', { replace: true });
    } catch (err) {
      if (err.field) setErrors({ [err.field]: err.message });
      else setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell
      wide
      title="Create your account"
      subtitle="Your units, notes, deadlines and quizzes stay private to you."
      footer={<>Already have an account? <Link to="/login" className="font-medium text-indigo-400 hover:text-indigo-300">Sign in</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormError message={formError} />

        <Field label="Full name" error={errors.full_name}>
          <input
            className="input" value={form.full_name} onChange={set('full_name')}
            placeholder="Jane Wanjiru" autoComplete="name"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Student / admission number" error={errors.admission_number}>
            <input
              className="input" value={form.admission_number} onChange={set('admission_number')}
              placeholder="ENG/1234/2023" autoComplete="username"
            />
          </Field>

          <Field label="Email address" error={errors.email}>
            <input
              className="input" type="email" value={form.email} onChange={set('email')}
              placeholder="jane@example.com" autoComplete="email"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone number" error={errors.phone} hint="Used for deadline reminders">
            <input
              className="input" type="tel" value={form.phone} onChange={set('phone')}
              placeholder="+254712345678" autoComplete="tel"
            />
          </Field>

          <Field label="Year of study" error={errors.year_of_study}>
            <select className="input" value={form.year_of_study} onChange={set('year_of_study')}>
              <option value="">Select year</option>
              {YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </Field>
        </div>

        <SchoolCoursePicker
          idPrefix="register"
          school={form.school}
          course={form.course}
          errors={errors}
          onChange={({ school, course }) => {
            setForm((f) => ({ ...f, school, course }));
            setErrors((prev) => ({ ...prev, school: undefined, course: undefined }));
          }}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" error={errors.password} hint="At least 8 characters, with a letter and a number">
            <div className="relative">
              <input
                className="input pr-10" type={showPassword ? 'text' : 'password'}
                value={form.password} onChange={set('password')} autoComplete="new-password"
              />
              <button
                type="button" onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>

          <Field label="Confirm password" error={errors.confirm_password}>
            <input
              className="input" type={showPassword ? 'text' : 'password'}
              value={form.confirm_password} onChange={set('confirm_password')} autoComplete="new-password"
            />
          </Field>
        </div>

        <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
          {saving ? <><Loader2 size={16} className="animate-spin" /> Creating account…</> : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}
