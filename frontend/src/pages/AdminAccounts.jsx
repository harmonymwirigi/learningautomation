import { useEffect, useState } from 'react';
import {
  Ban, CheckCircle2, KeyRound, Loader2, Search, Shield,
  ShieldOff, Trash2, Users, X,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';

function StatTile({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function Pill({ tone, children }) {
  const tones = {
    admin: 'bg-amber-500/15 text-amber-400',
    student: 'bg-slate-700/60 text-slate-400',
    active: 'bg-emerald-500/15 text-emerald-400',
    suspended: 'bg-red-500/15 text-red-400',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

function ResetPasswordModal({ user, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.admin.users.resetPassword(user.id, password);
      onDone(`Password reset for ${user.full_name}. Pass the new one on to them.`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Reset password — ${user.full_name}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-400">
          Sets a temporary password. There is no email delivery in StudyFlow, so give it to
          them directly and ask them to change it from their profile.
        </p>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
        )}

        <div>
          <label className="label">New password</label>
          <input
            className="input"
            type="text"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters, with a letter and a number"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={busy || !password} className="btn-primary">
            {busy ? <><Loader2 size={16} className="animate-spin" /> Resetting…</> : 'Reset password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AccountRow({ user, isSelf, onAction, onResetPassword }) {
  const [busy, setBusy] = useState(false);

  const run = async (fn, confirmMessage) => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-white">{user.full_name}</p>
          <Pill tone={user.role}>{user.role === 'admin' ? 'Admin' : 'Student'}</Pill>
          {!user.is_active && <Pill tone="suspended">Suspended</Pill>}
          {isSelf && <span className="text-xs text-slate-500">(you)</span>}
        </div>
        <p className="mt-1 truncate text-sm text-slate-400">
          {user.admission_number} · {user.email}
        </p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {[user.school, user.course, user.year_of_study ? `Year ${user.year_of_study}` : null]
            .filter(Boolean).join(' · ') || 'No academic details'}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          {user.units_count} units · {user.notes_count} notes · {user.assignments_count} assignments
        </p>
      </div>

      {/* An admin cannot act on their own row — the server refuses it too, so
          hiding the buttons just avoids offering something that will fail. */}
      {isSelf ? (
        <p className="text-xs text-slate-600 sm:w-40 sm:text-right">
          Ask another admin to change your own role or status
        </p>
      ) : (
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => onResetPassword(user)}
            disabled={busy}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-white"
            title="Reset password"
          >
            <KeyRound size={16} />
          </button>

          <button
            onClick={() => run(
              () => onAction(api.admin.users.setRole(user.id, user.role === 'admin' ? 'student' : 'admin'),
                user.role === 'admin' ? `${user.full_name} is now a student` : `${user.full_name} is now an admin`),
              user.role === 'admin'
                ? `Remove admin rights from ${user.full_name}?`
                : `Make ${user.full_name} an admin? They will be able to manage all accounts and schools.`,
            )}
            disabled={busy}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-amber-400"
            title={user.role === 'admin' ? 'Remove admin rights' : 'Make admin'}
          >
            {user.role === 'admin' ? <ShieldOff size={16} /> : <Shield size={16} />}
          </button>

          <button
            onClick={() => run(
              () => onAction(api.admin.users.setActive(user.id, !user.is_active),
                user.is_active ? `${user.full_name} suspended` : `${user.full_name} reactivated`),
              user.is_active
                ? `Suspend ${user.full_name}? They will be signed out immediately and cannot log back in.`
                : null,
            )}
            disabled={busy}
            className={`rounded-lg p-2 hover:bg-slate-800 ${
              user.is_active ? 'text-slate-500 hover:text-red-400' : 'text-emerald-400'
            }`}
            title={user.is_active ? 'Suspend account' : 'Reactivate account'}
          >
            {user.is_active ? <Ban size={16} /> : <CheckCircle2 size={16} />}
          </button>

          <button
            onClick={() => run(
              () => onAction(api.admin.users.remove(user.id), `${user.full_name} deleted`),
              `Permanently delete ${user.full_name}?\n\n`
                + `This also deletes their ${user.units_count} unit(s), ${user.notes_count} note(s) `
                + `and ${user.assignments_count} assignment(s). This cannot be undone.`,
            )}
            disabled={busy}
            className="rounded-lg p-2 text-slate-500 hover:bg-red-500/20 hover:text-red-400"
            title="Delete account"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminAccounts() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetting, setResetting] = useState(null);

  const load = async () => {
    try {
      const [list, s] = await Promise.all([
        api.admin.users.list({ search, role, status }),
        api.admin.stats(),
      ]);
      setUsers(list);
      setStats(s);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Re-query on every filter change; the search box is debounced so typing
  // does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, role, status]);

  const onAction = async (promise, successMessage) => {
    try {
      await promise;
      setNotice(successMessage);
      setError('');
      await load();
    } catch (err) {
      setError(err.message);
      setNotice('');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Accounts</h1>
        <p className="mt-1 text-sm text-slate-400">
          Every registered account. You can see who they are, not what they study — units,
          notes and quizzes stay private to each student.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Accounts" value={stats.total_users} />
          <StatTile label="Admins" value={stats.admins} />
          <StatTile label="Suspended" value={stats.suspended} />
          <StatTile label="Schools" value={stats.schools} />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
      )}
      {notice && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {notice}
          <button onClick={() => setNotice('')} className="text-emerald-400 hover:text-emerald-200"><X size={14} /></button>
        </div>
      )}

      <div className="card flex flex-col gap-2 p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-9"
            placeholder="Search by name, email, admission number, school or course"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input sm:w-40" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          <option value="admin">Admins</option>
          <option value="student">Students</option>
        </select>
        <select className="input sm:w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-slate-600" /></div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No accounts match"
          description={search || role || status ? 'Try clearing the filters.' : 'No one has registered yet.'}
        />
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <AccountRow
              key={u.id}
              user={u}
              isSelf={u.id === me.id}
              onAction={onAction}
              onResetPassword={setResetting}
            />
          ))}
        </div>
      )}

      {resetting && (
        <ResetPasswordModal
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={(message) => { setResetting(null); setNotice(message); setError(''); }}
        />
      )}
    </div>
  );
}
