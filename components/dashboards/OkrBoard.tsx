'use client';
/**
 * Recreation of the organisation OKR dashboard.
 *
 * ── The only one of the ten that is not an Apps Script app ────────────────
 * This is a page inside the ERP rather than a script deployment reading a
 * sheet, and that is the whole reason it exists in this form. OKRs were
 * already a record in the ERP with an owner, a manager and an approval
 * state; the missing thing was never the data but the aggregate, and putting
 * the aggregate next to the records (same permissions, same source) is what
 * a separate dashboard reading an export could not have done.
 *
 * ── Departments are derived, not stored ───────────────────────────────────
 * Every department figure on this page: member count, submission rate,
 * achieved over set, average progress, and which of the three bands it falls
 * into, is computed from `okrRows` by `byDepartment()`. The original derives
 * them the same way for the same reason: a department table maintained beside
 * an employee table is a pair of numbers waiting to disagree, and the
 * disagreement always surfaces in front of the person whose department is
 * being discussed.
 *
 * ── "Needs attention" is not a euphemism ──────────────────────────────────
 * The lowest performers are listed by name at 0%, next to the top performers,
 * on the page the whole organisation can open. That is what the dashboard was
 * for: before it, nobody was behind, because nobody could see who was.
 */
import { useMemo, useState } from 'react';
import {
  okrPeriod,
  okrRows,
  OKR_TOTALS,
  type OkrApproval,
  type OkrRow,
} from '@/content/dashboards-demo';
import { Donut, Legend, Ring } from './charts';
import { DashNote } from './shell';

const APPROVALS: OkrApproval[] = [
  'Approved',
  'Revision requested',
  'Pending approval',
  'Achievement review',
];

const APPROVAL_COLOR: Record<OkrApproval, string> = {
  Approved: '#2f8f7a',
  'Revision requested': '#7c3aed',
  'Pending approval': '#3b82f6',
  'Achievement review': '#ea8c1f',
};

/** Three bands, applied identically to a person and to a department. */
function band(progress: number) {
  if (progress >= 75) return { label: 'On track', cls: 'bg-emerald-50 text-emerald-700', bar: '#22c55e' };
  if (progress >= 40) return { label: 'At risk', cls: 'bg-amber-50 text-amber-700', bar: '#ea8c1f' };
  return { label: 'Off track', cls: 'bg-red-50 text-red-700', bar: '#dc2626' };
}

function byDepartment(rows: OkrRow[]) {
  const map = new Map<string, OkrRow[]>();
  for (const r of rows) map.set(r.department, [...(map.get(r.department) ?? []), r]);
  return [...map]
    .map(([name, members]) => ({
      name,
      members,
      set: members.reduce((n, m) => n + m.set, 0),
      achieved: members.reduce((n, m) => n + m.achieved, 0),
      avg: members.reduce((n, m) => n + m.progress, 0) / members.length,
    }))
    .sort((a, b) => b.avg - a.avg);
}

function Initials({ name, i = 0 }: { name: string; i?: number }) {
  const tones = [
    'bg-indigo-500',
    'bg-teal-500',
    'bg-rose-500',
    'bg-amber-500',
    'bg-sky-500',
    'bg-violet-500',
  ];
  return (
    <span
      className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${tones[i % tones.length]}`}
    >
      {name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)}
    </span>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[#eef1f7]">
      <span
        className="block h-full rounded-full"
        style={{ width: `${value}%`, background: band(value).bar }}
      />
    </span>
  );
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 overflow-hidden rounded-2xl border border-[#e4e8f0] bg-white p-4 sm:p-5 ${className}`}>
      <h4 className="mb-4 text-xs font-semibold tracking-[.08em] text-[#6b7280] uppercase">
        {title}
      </h4>
      {children}
    </section>
  );
}

export function OkrBoard() {
  const [tab, setTab] = useState<'org' | 'dept'>('org');
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('All departments');
  const [status, setStatus] = useState('All statuses');

  const departments = useMemo(() => byDepartment(okrRows), []);
  const deptNames = departments.map((d) => d.name).sort();

  const totals = useMemo(() => {
    const set = okrRows.reduce((n, r) => n + r.set, 0);
    const achieved = okrRows.reduce((n, r) => n + r.achieved, 0);
    const avg = okrRows.reduce((n, r) => n + r.progress, 0) / okrRows.length;
    return { set, achieved, avg, employees: okrRows.length };
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return okrRows
      .filter((r) => {
        if (dept !== 'All departments' && r.department !== dept) return false;
        if (status !== 'All statuses' && r.status !== status) return false;
        if (!q) return true;
        return `${r.name} ${r.empId} ${r.manager}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.progress - a.progress);
  }, [query, dept, status]);

  const distribution = APPROVALS.map((a) => ({
    label: a,
    value: okrRows.filter((r) => r.status === a).length,
    color: APPROVAL_COLOR[a],
  })).filter((s) => s.value > 0);

  const ranked = [...okrRows].sort((a, b) => b.progress - a.progress);
  const topThree = ranked.slice(0, 3);
  const bottomFive = [...ranked].reverse().slice(0, 5);

  return (
    <div className="dash-frame rounded-2xl bg-[#f6f7fb] p-4 text-[#1f2937] sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">
            <span className="text-indigo-600">OKR</span> dashboard
          </h3>
          <p className="mt-1 text-sm text-[#6b7280]">OKR period: {okrPeriod}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-[#e4e8f0] bg-white px-3 py-2 text-sm font-medium">
            {okrPeriod}
          </span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-[#e4e8f0] bg-white px-3 py-2 text-sm text-[#374151]">
            <span className="size-2 rounded-full bg-emerald-500" />
            Live · 10:09:07
          </span>
        </div>
      </header>

      <div className="mb-5 inline-flex rounded-full bg-white p-1 shadow-[0_1px_3px_rgba(16,24,40,.08)]">
        {(
          [
            ['org', 'Organisation'],
            ['dept', 'By department'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${tab === id ? 'bg-indigo-600 text-white' : 'text-[#6b7280] hover:text-[#111827]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'org' ? (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {[
              ['Active employees', totals.employees, `across ${departments.length} departments`, 'border-indigo-500'],
              ['Submitted', `${totals.employees} / ${totals.employees}`, '0 not submitted · 100%', 'border-emerald-500'],
              ['OKRs set', totals.set, `avg ${(totals.set / totals.employees).toFixed(1)} per employee`, 'border-sky-500'],
              ['OKRs achieved', totals.achieved, `${totals.set - totals.achieved} remaining`, 'border-emerald-500'],
              ['Achievement rate', `${Math.round((totals.achieved / totals.set) * 100)}%`, 'achieved ÷ set', 'border-amber-500'],
              ['Avg progress', `${totals.avg.toFixed(1)}%`, 'mean of submitters', 'border-teal-500'],
            ].map(([label, value, note, edge]) => (
              <div key={String(label)} className={`rounded-xl border-t-4 bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,.06)] ${edge}`}>
                <p className="text-[11px] font-semibold tracking-[.08em] text-[#6b7280] uppercase">{label}</p>
                <p className="mt-1 text-2xl font-bold text-[#111827] tabular-nums">{value}</p>
                <p className="mt-0.5 text-xs text-[#9ca3af]">{note}</p>
              </div>
            ))}
          </div>

          <div className="mb-5 grid gap-5 xl:grid-cols-3">
            <Card title="Overall progress">
              <div className="flex items-center gap-5">
                <Ring
                  value={totals.avg}
                  color={band(totals.avg).bar}
                  caption={{ value: `${totals.avg.toFixed(1)}%`, label: 'Avg progress' }}
                />
                <div className="min-w-0">
                  <p className="text-xl font-bold" style={{ color: band(totals.avg).bar }}>
                    {band(totals.avg).label}
                  </p>
                  <p className="mt-1 text-sm text-[#6b7280]">
                    {departments.filter((d) => band(d.avg).label === 'Off track').length} of {departments.length} departments are off track.
                  </p>
                </div>
              </div>
            </Card>

            <Card title="Status distribution">
              <div className="flex flex-col items-center gap-4">
                <Donut
                  segments={distribution}
                  center={{ value: totals.employees, label: 'Records' }}
                />
                <Legend segments={distribution} total={totals.employees} />
              </div>
            </Card>

            <Card title="Department avg progress">
              <ul className="space-y-3">
                {departments.map((d) => (
                  <li key={d.name}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-[#111827]">{d.name}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${band(d.avg).cls}`}>
                        {band(d.avg).label.toUpperCase()}
                      </span>
                    </div>
                    <p className="mb-1 text-xs text-[#6b7280]">
                      <strong className="text-[#111827] tabular-nums">{d.avg.toFixed(1)}%</strong> · {d.achieved}/{d.set} OKRs · {d.members.length} member{d.members.length > 1 ? 's' : ''}
                    </p>
                    <Bar value={d.avg} />
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="mb-5 grid gap-5 lg:grid-cols-2">
            <Card title="🏆 Top performers">
              <ul className="space-y-3">
                {topThree.map((r, i) => (
                  <li key={r.empId} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                    <span className="w-6 shrink-0 text-center text-lg">{['🥇', '🥈', '🥉'][i]}</span>
                    <Initials name={r.name} i={i} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#111827]">{r.name}</span>
                      <span className="block text-xs text-[#6b7280]">{r.department}</span>
                    </span>
                    <span className="w-20 shrink-0 text-right sm:w-28">
                      <span className="block text-sm font-bold text-[#111827] tabular-nums">{r.progress}%</span>
                      <Bar value={r.progress} />
                      <span className="mt-1 block text-[10px] font-semibold tracking-[.06em] text-[#9ca3af] uppercase">
                        {r.achieved}/{r.set} achieved
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="⚠ Needs attention, lowest performers">
              <ul className="space-y-3">
                {bottomFive.map((r, i) => (
                  <li key={r.empId} className="flex items-center gap-3 rounded-xl border border-[#e4e8f0] p-3">
                    <span className="w-6 shrink-0 text-center text-xs font-bold text-red-600">#{i + 1}</span>
                    <Initials name={r.name} i={i + 3} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#111827]">{r.name}</span>
                      <span className="block text-xs text-[#6b7280]">{r.department}</span>
                    </span>
                    <span className="w-20 shrink-0 text-right sm:w-28">
                      <span className="block text-sm font-bold text-red-600 tabular-nums">{r.progress}%</span>
                      <Bar value={r.progress} />
                      <span className="mt-1 block text-[10px] font-semibold tracking-[.06em] text-[#9ca3af] uppercase">
                        {r.achieved}/{r.set} achieved
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card title="Employee OKRs">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search employee, ID or manager..."
                className="min-w-55 flex-1 rounded-lg border border-[#e4e8f0] bg-[#f9fafb] px-3 py-2 text-sm outline-none placeholder:text-[#9ca3af] focus:border-indigo-400"
              />
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                className="rounded-lg border border-[#e4e8f0] bg-[#f9fafb] px-3 py-2 text-sm outline-none focus:border-indigo-400"
              >
                {['All departments', ...deptNames].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-lg border border-[#e4e8f0] bg-[#f9fafb] px-3 py-2 text-sm outline-none focus:border-indigo-400"
              >
                {['All statuses', ...APPROVALS].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
              <span className="ml-auto text-sm text-[#6b7280]">
                Showing <strong className="text-[#111827]">{rows.length}</strong> of {okrRows.length}
              </span>
            </div>
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-200 border-collapse">
                <thead>
                  <tr className="border-b border-[#eef1f7]">
                    {['Employee', 'Department', 'Manager', 'Set', 'Achieved', 'Progress', 'Progress status', 'Status'].map((h) => (
                      <th key={h} scope="col" className="px-3 py-3 text-left text-[11px] font-semibold tracking-[.08em] text-[#9ca3af] uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.empId} className="border-b border-[#f3f4f6] hover:bg-[#fafbfd]">
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2.5">
                          <Initials name={r.name} i={i} />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-[#111827]">{r.name}</span>
                            <span className="block text-xs text-[#9ca3af]">{r.empId}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-[#4b5563]">{r.department}</td>
                      <td className="px-3 py-3 text-sm text-[#4b5563]">{r.manager}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-[#111827] tabular-nums">{r.set}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-emerald-600 tabular-nums">{r.achieved}</td>
                      <td className="w-32 px-3 py-3">
                        <span className="mb-1 block text-sm font-semibold tabular-nums" style={{ color: band(r.progress).bar }}>
                          {r.progress}%
                        </span>
                        <Bar value={r.progress} />
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${band(r.progress).cls}`}>
                          {band(r.progress).label.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                          style={{ background: `${APPROVAL_COLOR[r.status]}1a`, color: APPROVAL_COLOR[r.status] }}
                        >
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-[#9ca3af]">No employees match those filters.</p>
            ) : null}
          </Card>
        </>
      ) : (
        <>
          <div className="mb-5 grid gap-5 lg:grid-cols-2">
            <Card title="🏆 Top performing departments">
              <ul className="space-y-3">
                {departments.slice(0, 3).map((d, i) => (
                  <li key={d.name} className="flex items-center gap-3">
                    <span className={`grid size-7 shrink-0 place-items-center rounded-md text-xs font-bold text-white ${['bg-amber-400', 'bg-slate-400', 'bg-amber-700'][i]}`}>
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[#111827]">{d.name}</span>
                      <span className="block text-xs text-[#6b7280]">
                        {d.achieved}/{d.set} OKRs · {d.members.length} member{d.members.length > 1 ? 's' : ''}
                      </span>
                    </span>
                    <span className="w-20 shrink-0 text-right sm:w-28">
                      <span className="block text-sm font-bold text-[#111827] tabular-nums">{d.avg.toFixed(1)}%</span>
                      <Bar value={d.avg} />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="⚠ Needs attention">
              <ul className="space-y-3">
                {[...departments].reverse().slice(0, 3).map((d, i) => (
                  <li key={d.name} className="flex items-center gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-red-500 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[#111827]">{d.name}</span>
                      <span className="block text-xs text-[#6b7280]">
                        {d.achieved}/{d.set} OKRs · {d.members.length} member{d.members.length > 1 ? 's' : ''}
                      </span>
                    </span>
                    <span className="w-20 shrink-0 text-right sm:w-28">
                      <span className="block text-sm font-bold text-red-600 tabular-nums">{d.avg.toFixed(1)}%</span>
                      <Bar value={d.avg} />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="space-y-5">
            {departments.map((d) => (
              <Card key={d.name} title={d.name}>
                <div className="-mt-2 mb-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-bold text-[#4b5563] tabular-nums">
                    {d.avg.toFixed(1)}% avg
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${band(d.avg).cls}`}>
                    {band(d.avg).label.toUpperCase()}
                  </span>
                </div>
                <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    [d.members.length, 'members'],
                    [`${d.members.length} / ${d.members.length}`, 'submitted'],
                    [`${d.achieved} / ${d.set}`, 'OKRs achieved'],
                    [`${((d.achieved / d.set) * 100).toFixed(1)}%`, 'achievement rate'],
                  ].map(([value, label]) => (
                    <div key={String(label)} className="rounded-xl bg-[#f7f8fc] p-3">
                      <p className="text-lg font-bold text-[#111827] tabular-nums">{value}</p>
                      <p className="text-xs text-[#6b7280]">{label}</p>
                    </div>
                  ))}
                </div>
                <Bar value={d.avg} />
                <div className="-mx-2 mt-4 overflow-x-auto">
                  <table className="w-full min-w-150 border-collapse">
                    <thead>
                      <tr className="border-b border-[#eef1f7]">
                        {['Employee', 'Reporting manager', 'Set', 'Achieved', 'Progress', 'Status'].map((h) => (
                          <th key={h} scope="col" className="px-3 py-2.5 text-left text-[11px] font-semibold tracking-[.08em] text-[#9ca3af] uppercase">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...d.members]
                        .sort((a, b) => b.progress - a.progress)
                        .map((m, i) => (
                          <tr key={m.empId} className="border-b border-[#f3f4f6]">
                            <td className="px-3 py-2.5">
                              <span className="flex items-center gap-2.5">
                                <Initials name={m.name} i={i} />
                                <span className="min-w-0">
                                  <span className="block text-sm font-semibold text-[#111827]">{m.name}</span>
                                  <span className="block text-xs text-[#9ca3af]">{m.empId}</span>
                                </span>
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-sm text-[#4b5563]">{m.manager}</td>
                            <td className="px-3 py-2.5 text-sm tabular-nums">{m.set}</td>
                            <td className="px-3 py-2.5 text-sm text-emerald-600 tabular-nums">{m.achieved}</td>
                            <td className="w-32 px-3 py-2.5">
                              <span className="mb-1 block text-sm font-semibold tabular-nums" style={{ color: band(m.progress).bar }}>
                                {m.progress}%
                              </span>
                              <Bar value={m.progress} />
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${band(m.progress).cls}`}>
                                {band(m.progress).label.toUpperCase()}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <DashNote>
        Recreation on synthetic data · {okrRows.length} employees across {departments.length} departments · the original covers {OKR_TOTALS.employees} employees, {OKR_TOTALS.departments} departments and {OKR_TOTALS.set} OKRs
      </DashNote>
    </div>
  );
}
