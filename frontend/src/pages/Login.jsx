import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import AuthShell, { Field, FormError } from '../components/AuthShell';

export default function Login() {
  const { user, signIn, endedReason, clearEndedReason } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(endedReason || '');
  const [saving, setSaving] = useState(false);
  const [hasAccounts, setHasAccounts] = useState(true);

  // On a brand-new install there is nothing to sign into, so point at sign-up.
  useEffect(() => {
    api.auth.status().then((s) => setHasAccounts(s.has_accounts)).catch(() => {});
  }, []);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!identifier.trim() || !password) {
      setError('Enter your email/admission number and password');
      return;
    }

    setSaving(true);
    try {
      clearEndedReason();
      await signIn({ identifier: identifier.trim(), password });
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your StudyFlow account"
      footer={<>New here? <Link to="/register" className="font-medium text-indigo-400 hover:text-indigo-300">Create an account</Link></>}
    >
      {!hasAccounts && (
        <div className="mb-4 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-300">
          No accounts yet — <Link to="/register" className="font-medium underline">create the first one</Link>.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormError message={error} />

        <Field label="Email or admission number">
          <input
            className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
            placeholder="jane@example.com" autoComplete="username" autoFocus
          />
        </Field>

        <Field label="Password">
          <div className="relative">
            <input
              className="input pr-10" type={showPassword ? 'text' : 'password'}
              value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
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

        <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
          {saving ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}
