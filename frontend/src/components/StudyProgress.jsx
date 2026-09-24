import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarRange, ChevronRight, Flame, Loader2, Lock, Target, TrendingUp,
} from 'lucide-react';
import { api } from '../api/client';
import ProgressRing, { ProgressBar } from './ProgressRing';

const COMPONENT_COLORS = {
  syllabus: '#6366f1',
  assignments: '#f59e0b',
  quizzes: '#a855f7',
  consistency: '#10b981',
};

export function formatMinutes(total) {
  const minutes = Math.round(total || 0);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function ringColor(percent) {
  if (percent >= 75) return '#10b981';
  if (percent >= 40) return '#6366f1';
  return '#f59e0b';
}

function WeekChart({ days }) {
  const peak = Math.max(...days.map((d) => d.minutes), 1);

  return (
    <div className="flex h-24 items-end justify-between gap-1.5">
      {days.map((day, i) => {
        const height = Math.max(day.minutes > 0 ? 6 : 2, (day.minutes / peak) * 100);
        const isToday = i === days.length - 1;
        return (
          <div key={day.day} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full flex-1 items-end">
              <div
                className={`w-full rounded-t transition-all duration-500 ${
                  day.minutes > 0 ? (isToday ? 'bg-emerald-400' : 'bg-emerald-600/70') : 'bg-slate-800'
                }`}
                style={{ height: `${height}%` }}
                title={`${day.label}: ${formatMinutes(day.minutes)}`}
              />
            </div>
            <span className={`text-[10px] ${isToday ? 'font-medium text-emerald-400' : 'text-slate-600'}`}>
              {day.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function UnitRow({ unit }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: unit.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm text-slate-200">
            {unit.name}
            {unit.code && <span className="ml-1.5 text-xs text-slate-600">{unit.code}</span>}
          </p>
          <span className={`text-sm font-medium ${unit.has_data ? 'text-white' : 'text-slate-600'}`}>
            {unit.has_data ? `${unit.percent}%` : '—'}
          </span>
        </div>
        <div className="mt-1.5">
          <ProgressBar percent={unit.percent} color={unit.color} muted={!unit.has_data} />
        </div>
        <p className="mt-1 text-xs text-slate-600">
          {unit.topics_total > 0 ? `${unit.topics_covered}/${unit.topics_total} topics` : 'no topics yet'}
          {' · '}
          {unit.assignments_total > 0 ? `${unit.assignments_done}/${unit.assignments_total} tasks` : 'no tasks'}
          {unit.avg_quiz !== null && ` · ${unit.avg_quiz}% quizzes`}
          {unit.study_minutes > 0 && ` · ${formatMinutes(unit.study_minutes)} studied`}
        </p>
      </div>
    </div>
  );
}

// The semester history: one card per term, newest work on the right. Clicking
// a card scopes the whole page to that semester.
function TermStrip({ terms, selected, onSelect }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {terms.map((term) => {
        const active = String(selected) === String(term.id);
        return (
          <button
            key={term.id}
            onClick={() => onSelect(String(term.id))}
            className={`flex min-w-[9.5rem] flex-shrink-0 flex-col items-start rounded-xl border px-3 py-2.5 text-left transition ${
              active
                ? 'border-indigo-500/60 bg-indigo-600/15'
                : 'border-slate-800 bg-surface-900/60 hover:border-slate-700'
            }`}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-300">
                Y{term.year_of_study} · S{term.semester}
              </span>
              {term.is_current && (
                <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                  now
                </span>
              )}
            </div>
            <span className="mt-1 text-xl font-bold text-white">
              {term.has_data ? `${term.percent}%` : '—'}
            </span>
            <span className="mt-0.5 text-[11px] text-slate-600">
              {term.units_count} unit{term.units_count === 1 ? '' : 's'}
              {term.study_minutes > 0 && ` · ${formatMinutes(term.study_minutes)}`}
            </span>
          </button>
        );
      })}

      <button
        onClick={() => onSelect('all')}
        className={`flex min-w-[8rem] flex-shrink-0 flex-col items-start rounded-xl border px-3 py-2.5 text-left transition ${
          selected === 'all'
            ? 'border-indigo-500/60 bg-indigo-600/15'
            : 'border-slate-800 bg-surface-900/60 hover:border-slate-700'
        }`}
      >
        <span className="text-xs font-medium text-slate-300">All time</span>
        <span className="mt-1 text-xs text-slate-600">Every year</span>
      </button>
    </div>
  );
}

// `compact` renders just the ring and headline numbers, for the dashboard.
export default function StudyProgress({ compact = false }) {
  const [scopeId, setScopeId] = useState(null); // null = whatever term is current
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [advancing, setAdvancing] = useState(false);

  const load = useCallback(async (termId) => {
    try {
      setData(await api.progress(termId));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(scopeId); }, [scopeId, load]);

  const startNextSemester = async () => {
    const next = data?.next_term;
    const name = next ? `Year ${next.year_of_study} Semester ${next.semester}` : 'the next semester';
    if (!window.confirm(
      `Start ${name}?\n\n`
      + 'Your current semester is kept exactly as it is — its units, notes and score '
      + 'stay on record. New units you add will belong to the new semester.',
    )) return;

    setAdvancing(true);
    try {
      await api.terms.startNext();
      setScopeId(null);
      await load(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setAdvancing(false);
    }
  };

  if (error) {
    return <div className="card p-6 text-sm text-red-300">Could not load your progress: {error}</div>;
  }

  if (!data) {
    return (
      <div className="card flex items-center justify-center p-10">
        <Loader2 size={22} className="animate-spin text-slate-600" />
      </div>
    );
  }

  const {
    overall, components, streak, study, weekly_chart: weeklyChart,
    totals, per_unit: perUnit, terms, scope, is_live: isLive,
  } = data;

  const scopeName = scope.type === 'all' ? 'All time' : scope.term?.name;
  const selected = scopeId ?? (scope.type === 'all' ? 'all' : String(scope.term?.id));

  if (compact) {
    return (
      <div className="card flex items-center gap-5 p-5">
        <ProgressRing percent={overall.percent} size={104} stroke={9} color={ringColor(overall.percent)} label="Study progress" />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            <Target size={16} className="text-cyan-400" /> Study Progress
          </h2>
          <p className="mt-0.5 text-sm text-slate-400">{scopeName} — {overall.label}</p>
          <p className="mt-2 text-xs text-slate-500">
            {streak.current_days > 0 && <span className="text-amber-400">{streak.current_days}-day streak · </span>}
            {formatMinutes(study.week_minutes)} this week
          </p>
          <Link to="/progress" className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-400 hover:underline">
            See every semester <ChevronRight size={12} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* The ring leads: it is the first thing on the page, with the semester
          it refers to named right beside it. */}
      <div className="card p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center">
            <ProgressRing
              percent={overall.percent}
              size={168}
              color={ringColor(overall.percent)}
              label={`${scopeName} progress`}
              sublabel={overall.label}
            />
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-slate-300">
              {!isLive && <Lock size={12} className="text-slate-600" />}
              {scopeName}
            </p>
            <p className="mt-1 max-w-[12rem] text-center text-xs text-slate-600">
              {isLive
                ? `Averaged across ${overall.measured_components} of ${overall.total_components} measures`
                : 'Finished semester — the score is final'}
            </p>
          </div>

          <div className="w-full flex-1 space-y-4">
            {components.map((c) => (
              <div key={c.key}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className={`text-sm ${c.available ? 'text-slate-200' : 'text-slate-500'}`}>
                    {c.label}
                  </span>
                  <span className={`text-sm font-medium ${c.available ? 'text-white' : 'text-slate-600'}`}>
                    {c.available ? `${c.percent}%` : '—'}
                  </span>
                </div>
                <ProgressBar percent={c.percent} color={COMPONENT_COLORS[c.key]} muted={!c.available} />
                <p className="mt-1 text-xs text-slate-600">{c.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <CalendarRange size={15} className="text-indigo-400" /> Your semesters
          </h3>
          <button onClick={startNextSemester} disabled={advancing} className="btn-secondary text-xs">
            {advancing
              ? <><Loader2 size={13} className="animate-spin" /> Starting…</>
              : <>Start Year {data.next_term.year_of_study} Semester {data.next_term.semester}</>}
          </button>
        </div>
        <TermStrip terms={terms} selected={selected} onSelect={setScopeId} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
            <Flame size={13} className="text-amber-400" /> {isLive ? 'Current streak' : 'Best streak'}
          </p>
          <p className="mt-1 text-2xl font-bold text-white">
            {isLive ? streak.current_days : streak.best_days}
            <span className="ml-1 text-base font-normal text-slate-500">days</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            {isLive ? `Best: ${streak.best_days} days` : `${streak.total_days} days studied`}
          </p>
        </div>

        <div className="card p-4">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
            <TrendingUp size={13} className="text-emerald-400" /> Studied
          </p>
          <p className="mt-1 text-2xl font-bold text-white">{formatMinutes(study.total_minutes)}</p>
          <p className="mt-0.5 text-xs text-slate-600">
            {study.sessions} session{study.sessions === 1 ? '' : 's'} · {scopeName.toLowerCase()}
          </p>
        </div>

        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Tasks &amp; quizzes</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {totals.assignments_done}
            <span className="text-base font-normal text-slate-500">/{totals.assignments_total}</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            {totals.assignments_overdue > 0
              ? <span className="text-red-400">{totals.assignments_overdue} overdue</span>
              : 'nothing overdue'}
            {' · '}{totals.quiz_attempts} quiz attempt{totals.quiz_attempts === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {isLive && weeklyChart.length > 0 && (
        <div className="card p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold text-white">Last 7 days</h3>
            <p className="text-xs text-slate-500">
              {formatMinutes(study.week_minutes)} of {formatMinutes(study.weekly_goal_minutes)} goal
              <Link to="/profile" className="ml-2 text-indigo-400 hover:underline">change goal</Link>
            </p>
          </div>
          <WeekChart days={weeklyChart} />
        </div>
      )}

      <div className="card p-5">
        <h3 className="mb-2 font-semibold text-white">
          Units {scope.type === 'all' ? 'across every semester' : `in ${scopeName}`}
        </h3>
        {perUnit.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">
            No units in this semester.{' '}
            <Link to="/units" className="text-indigo-400 hover:underline">Add one</Link> to start tracking it.
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-slate-600">
              Each unit blends its syllabus coverage, completed tasks and quiz scores — whichever it has.
            </p>
            <div className="divide-y divide-slate-800">
              {perUnit.map((u) => <UnitRow key={u.id} unit={u} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
