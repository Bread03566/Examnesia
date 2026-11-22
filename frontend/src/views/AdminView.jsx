import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Search, UserX, UserCheck, History } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import StatePanel from '../components/StatePanel';
import { getAdminAudit, getAdminOverview, getAdminStudents, getAdminSystem, setStudentActive } from '../services/api';

const STATS = [
  ['students', 'Students'],
  ['active_students', 'Active'],
  ['disabled_students', 'Deactivated'],
  ['documents', 'Modules'],
  ['flashcards', 'Flashcards'],
  ['questions', 'Questions'],
  ['quiz_attempts', 'Quiz attempts'],
];

// The API sends UTC timestamps without a zone suffix.
const fmt = (iso) => (iso ? new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`).toLocaleString() : 'Never');

function Meter({ label, used, limit, unit }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = pct >= 90 ? 'bg-rose-600' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-600';
  return (
    <div>
      <div className="flex justify-between text-xs font-semibold text-slate-700">
        <span>{label}</span>
        <span>{used} / {limit} {unit} ({pct}%)</span>
      </div>
      <div
        className="mt-1.5 h-2 rounded-full bg-slate-100"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SystemPanel({ system }) {
  const { database, text_storage: text, ai, backup } = system;
  return (
    <section aria-label="System status" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3 shadow-xs">
      <h2 className="text-sm font-bold text-slate-900">System Health</h2>
      {backup.warning ? (
        <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs sm:text-sm text-amber-950">
          {backup.message}
        </p>
      ) : (
        <p className="text-xs text-slate-600">{backup.message}</p>
      )}
      {database.size_mb !== null && <Meter label="Database size" used={database.size_mb} limit={database.limit_mb} unit="MB" />}
      <Meter label="Study text stored" used={text.used_mb} limit={text.budget_mb} unit="MB" />
      <p className="text-xs text-slate-700 pt-1">
        Gemini AI: <strong>{ai.enabled ? 'on' : 'off'}</strong> · {ai.calls_today} / {ai.global_daily_limit} requests today · {ai.consenting_students} student(s) opted in
      </p>
    </section>
  );
}

function StatusBadge({ student }) {
  const cls =
    student.role === 'admin'
      ? 'bg-blue-50 text-blue-800 border border-blue-200'
      : student.is_active
      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
      : 'bg-slate-100 text-slate-700 border border-slate-300';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>
      {student.role === 'admin' ? 'Admin' : student.is_active ? 'Active' : 'Deactivated'}
    </span>
  );
}

export default function AdminView({ showToast }) {
  const [overview, setOverview] = useState(null);
  const [students, setStudents] = useState([]);
  const [audit, setAudit] = useState([]);
  const [system, setSystem] = useState(null);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [pendingDeactivate, setPendingDeactivate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (q) => {
    try {
      const [o, s, a, sys] = await Promise.all([
        getAdminOverview(),
        getAdminStudents(q),
        getAdminAudit(),
        getAdminSystem(),
      ]);
      setOverview(o);
      setSystem(sys);
      setStudents(s.students);
      setAudit(a.entries);
      setError('');
    } catch (e) {
      setError(e.message || 'Could not load admin dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(query), 250);
    return () => clearTimeout(t);
  }, [query, load]);

  const executeToggle = async (student, nextActive) => {
    setBusyId(student.id);
    try {
      await setStudentActive(student.id, nextActive);
      showToast?.('success', nextActive ? 'Account reactivated.' : 'Account deactivated.');
      setPendingDeactivate(null);
      await load(query);
    } catch (e) {
      showToast?.('error', e.message || 'Could not update account status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleClick = (student) => {
    if (student.is_active) {
      setPendingDeactivate(student);
    } else {
      executeToggle(student, true);
    }
  };

  if (loading && !overview) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <StatePanel
          variant="loading"
          title="Loading Admin Console..."
          description="Fetching overview counts, student directory, and audit logs."
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-900">
            <ShieldCheck className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">Admin Console</h1>
            <p className="text-xs text-slate-600">Account status, system quotas, and append-only audit history.</p>
          </div>
        </div>
      </div>

      {error && (
        <StatePanel
          variant="error"
          title="Could not load admin data"
          description={error}
          actionLabel="Retry"
          onAction={() => load(query)}
        />
      )}

      {/* Overview Stats */}
      <section aria-label="Overview" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STATS.map(([key, label]) => (
          <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <p className="text-2xl font-extrabold text-slate-900">{overview ? overview[key] : '–'}</p>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">{label}</p>
          </div>
        ))}
      </section>

      {system && <SystemPanel system={system} />}

      {/* Students Directory */}
      <section aria-label="Students" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
          <h2 className="text-sm sm:text-base font-bold text-slate-900">Students</h2>
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">Search students by Gmail or name</span>
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={60}
              placeholder="Search Gmail or name..."
              className="w-full min-h-[40px] rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </label>
        </div>
        <p className="text-xs text-slate-600 mb-4">Account details only. Student study content is never visible here.</p>

        {/* Mobile Stacked Cards (< 768px) */}
        <div className="md:hidden space-y-3">
          {students.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 p-3.5 space-y-2.5 bg-slate-50/50">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-sm text-slate-900 truncate" translate="no">{s.display_name}</p>
                  <p className="text-xs text-slate-600 truncate" translate="no">{s.username.includes('@') ? s.username : `@${s.username}`}</p>
                </div>
                <StatusBadge student={s} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 pt-2 border-t border-slate-200/70">
                <span>{s.document_count} modules · Last login: {fmt(s.last_login_at)}</span>
                {s.role === 'student' && (
                  <button
                    type="button"
                    onClick={() => handleToggleClick(s)}
                    disabled={busyId === s.id}
                    className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {s.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                    {s.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {students.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-600">No students found.</p>
          )}
        </div>

        {/* Desktop & Tablet Table (≥ 768px) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-600 border-b border-slate-200">
                <th className="py-2.5 pr-3 font-semibold">Name</th>
                <th className="py-2.5 pr-3 font-semibold">Gmail / Username</th>
                <th className="py-2.5 pr-3 font-semibold">Modules</th>
                <th className="py-2.5 pr-3 font-semibold">Last login</th>
                <th className="py-2.5 pr-3 font-semibold">Status</th>
                <th className="py-2.5 font-semibold text-right"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="py-2.5 pr-3 font-semibold text-slate-900" translate="no">{s.display_name}</td>
                  <td className="py-2.5 pr-3 text-slate-600" translate="no">{s.username.includes('@') ? s.username : `@${s.username}`}</td>
                  <td className="py-2.5 pr-3 text-slate-700">{s.document_count}</td>
                  <td className="py-2.5 pr-3 text-slate-600 whitespace-nowrap">{fmt(s.last_login_at)}</td>
                  <td className="py-2.5 pr-3"><StatusBadge student={s} /></td>
                  <td className="py-2.5 text-right">
                    {s.role === 'student' && (
                      <button
                        type="button"
                        onClick={() => handleToggleClick(s)}
                        disabled={busyId === s.id}
                        className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {s.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        {s.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-slate-600">No students found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Audit Log */}
      <section aria-label="Audit log" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
        <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2 mb-1">
          <History className="w-4 h-4 text-amber-700" />
          <span>Audit Log</span>
        </h2>
        <p className="text-xs text-slate-600 mb-3">Every admin change is recorded here, newest first.</p>
        <ul className="divide-y divide-slate-100 text-xs sm:text-sm">
          {audit.map((e) => (
            <li key={e.id} className="py-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-800">
              <span className="text-slate-600 whitespace-nowrap text-xs">{fmt(e.created_at)}</span>
              <span className="font-semibold" translate="no">@{e.actor}</span>
              <span>{e.action === 'student.deactivate' ? 'deactivated' : 'reactivated'} student</span>
              <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{e.target.slice(0, 8)}</span>
            </li>
          ))}
          {audit.length === 0 && <li className="py-4 text-slate-600">No admin changes recorded yet.</li>}
        </ul>
      </section>

      <ConfirmDialog
        isOpen={Boolean(pendingDeactivate)}
        onClose={() => setPendingDeactivate(null)}
        onConfirm={() => pendingDeactivate && executeToggle(pendingDeactivate, false)}
        busy={Boolean(pendingDeactivate && busyId === pendingDeactivate.id)}
        variant="danger"
        title="Deactivate student account?"
        message={
          pendingDeactivate
            ? `Deactivate ${pendingDeactivate.display_name} (@${pendingDeactivate.username})? They will be signed out everywhere immediately and cannot log in until reactivated.`
            : ''
        }
        confirmLabel="Deactivate account"
      />
    </div>
  );
}
