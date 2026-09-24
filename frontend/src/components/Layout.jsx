import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, FileText, ClipboardList,
  Bell, GraduationCap, Timer, Menu, X, Calendar,
  CalendarClock, Brain, Target, LogOut, User, Users, Building2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useBrowserNotifications } from '../hooks/useBrowserNotifications';
import ChatAssistant from './ChatAssistant';

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/units', icon: BookOpen, label: 'Units' },
  { to: '/notes', icon: FileText, label: 'Notes' },
  { to: '/past-papers', icon: GraduationCap, label: 'Past Papers' },
  { to: '/assignments', icon: ClipboardList, label: 'Assignments' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/timetable', icon: CalendarClock, label: 'Timetable' },
  { to: '/exam-prep', icon: Brain, label: 'Exam Prep' },
  { to: '/study', icon: Timer, label: 'Study Log' },
  { to: '/progress', icon: Target, label: 'Study Progress' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
];

// Only rendered for admins; the routes behind them are guarded server-side too.
const adminNav = [
  { to: '/admin/accounts', icon: Users, label: 'Accounts' },
  { to: '/admin/schools', icon: Building2, label: 'Schools & Courses' },
];

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function AccountCard({ user, onSignOut, onNavigate }) {
  return (
    <div className="border-t border-slate-800 p-4">
      <NavLink
        to="/profile"
        onClick={onNavigate}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-lg p-2 transition ${
            isActive ? 'bg-indigo-600/20' : 'hover:bg-slate-800'
          }`
        }
      >
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
          {initials(user.full_name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-200">{user.full_name}</p>
          <p className="truncate text-xs text-slate-500">
            {user.role === 'admin'
              ? 'Administrator'
              : user.course || user.school || user.admission_number}
          </p>
        </div>
      </NavLink>
      <div className="mt-2 flex gap-2">
        <NavLink
          to="/profile"
          onClick={onNavigate}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        >
          <User size={14} /> Profile
        </NavLink>
        <button
          onClick={onSignOut}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-400 transition hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </div>
  );
}

export default function Layout() {
  const [unread, setUnread] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const { user, signOut, isAdmin } = useAuth();

  useBrowserNotifications();

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      setShowNotifBanner(true);
    }
  }, []);

  const enableNotifications = async () => {
    await Notification.requestPermission();
    setShowNotifBanner(false);
  };

  useEffect(() => {
    api.notifications.unreadCount()
      .then((d) => setUnread(d.count))
      .catch(() => {});
    const interval = setInterval(() => {
      api.notifications.unreadCount()
        .then((d) => setUnread(d.count))
        .catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
      isActive
        ? 'bg-indigo-600/20 text-indigo-400'
        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
    }`;

  const NavItems = ({ onClick }) => (
    <>
      {nav.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={to === '/'} onClick={onClick} className={navLinkClass}>
          <Icon size={18} />
          {label}
          {label === 'Notifications' && unread > 0 && (
            <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
              {unread}
            </span>
          )}
        </NavLink>
      ))}

      {isAdmin && (
        <>
          <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-600">
            Administration
          </p>
          {adminNav.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} onClick={onClick} className={navLinkClass}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </>
      )}
    </>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-slate-800 bg-surface-900 lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <GraduationCap size={18} className="text-white" />
          </div>
          <span className="text-lg font-bold text-white">StudyFlow</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          <NavItems />
        </nav>
        <AccountCard user={user} onSignOut={signOut} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-slate-800 bg-surface-900">
            <div className="flex h-16 items-center justify-between border-b border-slate-800 px-4">
              <span className="text-lg font-bold text-white">StudyFlow</span>
              <button onClick={() => setMobileOpen(false)} className="text-slate-400">
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-4">
              <NavItems onClick={() => setMobileOpen(false)} />
            </nav>
            <AccountCard
              user={user}
              onSignOut={signOut}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center gap-4 border-b border-slate-800 bg-surface-900/50 px-4 lg:px-8">
          <button onClick={() => setMobileOpen(true)} className="text-slate-400 lg:hidden">
            <Menu size={22} />
          </button>
          <h1 className="text-sm text-slate-500">
            {user.full_name.split(' ')[0]}&rsquo;s study assistant
            {user.school ? <span className="hidden sm:inline"> · {user.school}</span> : null}
          </h1>
          <NavLink
            to="/profile"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white lg:hidden"
            aria-label="Your profile"
          >
            {initials(user.full_name)}
          </NavLink>
        </header>
        {showNotifBanner && (
          <div className="flex items-center justify-between gap-4 border-b border-indigo-500/20 bg-indigo-500/10 px-4 py-2 lg:px-8">
            <p className="text-sm text-indigo-300">Enable browser notifications to get deadline alerts even when this tab is in the background.</p>
            <div className="flex gap-2">
              <button onClick={enableNotifications} className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500">Enable</button>
              <button onClick={() => setShowNotifBanner(false)} className="rounded-lg px-3 py-1 text-xs text-slate-400 hover:text-white">Dismiss</button>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>

      <ChatAssistant />
    </div>
  );
}
