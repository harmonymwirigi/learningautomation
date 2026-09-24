import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Flame, Loader2, LogOut } from 'lucide-react';
import { api } from '../api/client';
import ProgressRing from './ProgressRing';
import { formatMinutes } from './StudyProgress';

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// The top of the profile: who you are on the left, how the current semester is
// going on the right. The ring is the first thing on the page.
export default function ProfileProgressHeader({ user, onSignOut }) {
  const [progress, setProgress] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.progress()
      .then((p) => { if (!cancelled) setProgress(p); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const percent = progress?.overall.percent ?? 0;
  const color = percent >= 75 ? '#10b981' : percent >= 40 ? '#6366f1' : '#f59e0b';
  const termName = progress?.scope.term?.name;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
        <div className="flex flex-shrink-0 justify-center sm:justify-start">
          {failed ? (
            <div className="flex h-[150px] w-[150px] items-center justify-center rounded-full border-2 border-dashed border-slate-800 text-xs text-slate-600">
              progress unavailable
            </div>
          ) : progress ? (
            <ProgressRing
              percent={percent}
              size={150}
              stroke={11}
              color={color}
              label="Study progress"
              sublabel={termName}
            />
          ) : (
            <div className="flex h-[150px] w-[150px] items-center justify-center">
              <Loader2 size={22} className="animate-spin text-slate-700" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
              {initials(user.full_name)}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold text-white">{user.full_name}</h1>
              <p className="truncate text-sm text-slate-400">{user.admission_number}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {[user.course, user.school].filter(Boolean).join(' · ') || 'No course set'}
              </p>
            </div>
          </div>

          {progress && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="text-slate-300">{progress.overall.label}</span>
              {progress.streak.current_days > 0 && (
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Flame size={14} /> {progress.streak.current_days}-day streak
                </span>
              )}
              <span className="text-slate-500">
                {formatMinutes(progress.study.week_minutes)} this week
              </span>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/progress" className="btn-primary text-xs">
              Study progress <ChevronRight size={14} />
            </Link>
            <button onClick={onSignOut} className="btn-secondary text-xs">
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      </div>

      {/* A glance at every semester so far, without leaving the profile. */}
      {progress?.terms?.length > 1 && (
        <div className="flex gap-4 overflow-x-auto border-t border-slate-800 bg-surface-900/50 px-6 py-3">
          {progress.terms.map((term) => (
            <Link
              key={term.id}
              to="/progress"
              className="flex-shrink-0 text-center"
              title={`${term.name} — ${term.units_count} unit(s)`}
            >
              <p className={`text-xs ${term.is_current ? 'text-emerald-400' : 'text-slate-500'}`}>
                Y{term.year_of_study}·S{term.semester}
              </p>
              <p className={`text-sm font-semibold ${term.has_data ? 'text-white' : 'text-slate-700'}`}>
                {term.has_data ? `${term.percent}%` : '—'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
