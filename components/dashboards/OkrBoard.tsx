'use client';
/**
 * Recreation of the organisation OKR dashboard.
 *
 * ── Not an Apps Script app, unlike most of the others ─────────────────────
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
 * ── Manager Review Coverage asks who, not how much ────────────────────────
 * Every other figure here is about employees. This one is about the people
 * reviewing them: per reporting manager, how many reports had their monthly
 * review marked in the picked month, and at the end of the period how many
 * OKRs the manager closed as Completed. A review counts towards the month it
 * was *marked* in, not the month it was filed under, so an April review ticked
 * on 1 May is May's work. An OKR that is not yet approved cannot be reviewed,
 * so it stays in the denominator but is labelled as such, and the manager is
 * not blamed for it. `reviewGroups()` and `completionGroups()` mirror the
 * original's two tabs.
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
} from '@/content/dashboards-data/okr';
import { Donut, Legend, Ring } from './charts';
import { FilterBar, Panel } from './primitives';
import { DashNote } from './shell';

const APPROVALS: OkrApproval[] = [
  'Approved',
  'Revision requested',
  'Pending approval',
  'Achievement review',
  'Completed',
];

const APPROVAL_COLOR: Record<OkrApproval, string> = {
  Approved: '#2f8f7a',
  'Revision requested': '#7c3aed',
  'Pending approval': '#3b82f6',
  'Achievement review': '#ea8c1f',
  Completed: '#16a34a',
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

function Initials({ name, i = 0, dim = false }: { name: string; i?: number; dim?: boolean }) {
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
      className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${dim ? 'bg-slate-300' : tones[i % tones.length]}`}
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

/** Panel's outline variant, never clipped: the tables inside scroll sideways. */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel outline title={title} className="min-w-0 overflow-hidden">
      {children}
    </Panel>
  );
}

/* ───────────────────────── Manager Review Coverage ───────────────────────── */

/** Statuses a manager can mark a monthly review against; anything else is not yet approved. */
const REVIEWABLE: OkrApproval[] = ['Approved', 'Revision requested', 'Achievement review', 'Completed'];
const NOT_REVIEWABLE_LABEL: Partial<Record<OkrApproval, string>> = { 'Pending approval': 'Awaiting approval' };
const NO_MANAGER = 'No Reporting Manager';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** The period's months, oldest first. The picker defaults to the last. */
const PERIOD_MONTHS = ['2026-04', '2026-05', '2026-06'];

type Stage = 'completed' | 'awaiting' | 'pending';
type Bucket = 'full' | 'part' | 'none';
const STAGE_META: Record<Stage, { hex: string; label: string; filter: string }> = {
  awaiting: { hex: '#d97706', label: 'Achievement submitted', filter: 'Achievement submitted' },
  pending: { hex: '#dc2626', label: 'Pending submission', filter: 'Pending submission' },
  completed: { hex: '#16a34a', label: '✓ Completed', filter: 'Completed' },
};
const STAGE_ORDER: Record<Stage, number> = { awaiting: 0, pending: 1, completed: 2 };
const SORTS = {
  monthly: ['Coverage: low to high', 'Coverage: high to low', 'Manager name: A to Z', 'Manager name: Z to A', 'Latest reviewed first', 'Oldest reviewed first'],
  completion: ['Completion: low to high', 'Completion: high to low', 'Most awaiting completion', 'Manager name: A to Z', 'Manager name: Z to A'],
};

const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const fmtDate = (d: string) => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3)} ${d.slice(0, 4)}` : '');
const stageOf = (s: OkrApproval): Stage => (s === 'Completed' ? 'completed' : s === 'Achievement review' ? 'awaiting' : 'pending');
const managerOf = (r: OkrRow) => (r.manager && r.manager !== 'n/a' ? r.manager : NO_MANAGER);

interface Member { row: OkrRow; reviewed: boolean; reviewable: boolean; latest: string; stage: Stage }
interface Group { name: string; rows: Member[]; total: number; done: number; awaiting: number; pending: number; pct: number; bucket: Bucket; latest: string }

function finish(name: string, rows: Member[], done: number, awaiting: number, latest: string): Group {
  const total = rows.length;
  return { name, rows, total, done, awaiting, pending: total - done - awaiting, pct: total ? Math.round((done / total) * 100) : 0, bucket: !done ? 'none' : done === total ? 'full' : 'part', latest };
}

function byManager(rows: OkrRow[]) {
  const map = new Map<string, OkrRow[]>();
  for (const r of rows) map.set(managerOf(r), [...(map.get(managerOf(r)) ?? []), r]);
  return [...map];
}

/** Monthly Review: reviewed = a review marked in `month`. Not-reviewed reports first. */
function reviewGroups(rows: OkrRow[], month: string): Group[] {
  return byManager(rows).map(([name, reports]) => {
    const members = reports.map((row): Member => {
      const inMonth = (row.reviews ?? []).filter((d) => d.startsWith(month));
      return { row, reviewed: inMonth.length > 0, reviewable: REVIEWABLE.includes(row.status), latest: inMonth.sort().at(-1) ?? '', stage: stageOf(row.status) };
    }).sort((a, b) => Number(a.reviewed) - Number(b.reviewed) || a.row.name.localeCompare(b.row.name));
    const done = members.filter((m) => m.reviewed).length;
    const awaiting = members.filter((m) => !m.reviewable && !m.reviewed).length;
    return finish(name, members, done, awaiting, members.reduce((acc, m) => (m.latest > acc ? m.latest : acc), ''));
  });
}

/** Final Completion: the manager's to-do (submitted, waiting on them) first, then pending, then done. */
function completionGroups(rows: OkrRow[]): Group[] {
  return byManager(rows).map(([name, reports]) => {
    const members = reports.map((row): Member => ({ row, reviewed: false, reviewable: true, latest: row.completedOn ?? '', stage: stageOf(row.status) }))
      .sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || a.row.name.localeCompare(b.row.name));
    const done = members.filter((m) => m.stage === 'completed').length;
    const awaiting = members.filter((m) => m.stage === 'awaiting').length;
    return finish(name, members, done, awaiting, members.reduce((acc, m) => (m.stage === 'completed' && m.latest > acc ? m.latest : acc), ''));
  });
}

/** Worst first by default, since the managers who are behind are the point. No Reporting Manager is not a person and is pinned last. */
function sortGroups(groups: Group[], mode: string) {
  const name = (a: Group, b: Group) => a.name.localeCompare(b.name);
  return [...groups].sort((a, b) => {
    if (a.name === NO_MANAGER) return 1;
    if (b.name === NO_MANAGER) return -1;
    if (mode.endsWith('A to Z')) return name(a, b);
    if (mode.endsWith('Z to A')) return name(b, a);
    if (mode === 'Most awaiting completion') return b.awaiting - a.awaiting || name(a, b);
    if (mode.includes('reviewed first')) {
      if (!a.latest !== !b.latest) return a.latest ? -1 : 1;
      if (a.latest !== b.latest) return (a.latest < b.latest ? -1 : 1) * (mode.startsWith('Latest') ? -1 : 1);
      return name(a, b);
    }
    if (a.pct !== b.pct) return mode.endsWith('high to low') ? b.pct - a.pct : a.pct - b.pct;
    return b.total - b.done - (a.total - a.done) || name(a, b);
  });
}

function Pill({ hex, children }: { hex: string; children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full border px-2.5 py-1 text-[11px] font-bold whitespace-nowrap uppercase" style={{ color: hex, borderColor: `${hex}73`, background: `${hex}1f` }}>
      {children}
    </span>
  );
}

/** The matched run of a search, highlighted. */
function hit(text: string, q: string) {
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i === -1) return text;
  return <>{text.slice(0, i)}<mark className="rounded bg-amber-100 px-0.5 text-inherit">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

function Tile({ color, value, label, active, title, onClick }: { color: string; value: number; label: string; active: boolean; title: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} title={title}
      className={`rounded-xl border! border-l-4! px-3 py-3 text-left transition hover:bg-white! sm:px-5 sm:py-4 ${active ? 'border-[#c7cbe0]! bg-white! ring-2 ring-indigo-200' : 'border-[#e9ecf4]! bg-[#f7f8fc]!'}`}
      style={{ borderLeftColor: color }}
    >
      <span className="block text-2xl font-bold tabular-nums sm:text-3xl" style={{ color }}>{value}</span>
      <span className="mt-1 block text-[10px] font-semibold tracking-[.08em] text-[#4b5563] uppercase sm:text-[11px]">{label}</span>
    </button>
  );
}

function TileGroup({ caption, note, children }: { caption: string; note: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs text-[#6b7280]"><strong className="font-semibold tracking-[.08em] text-[#4b5563] uppercase">{caption}</strong> · {note}</p>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">{children}</div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`size-4 shrink-0 stroke-[#6b7280] transition-transform ${open ? 'rotate-90' : ''}`} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

const GOOD = '#16a34a', WARN = '#d97706', BAD = '#dc2626';

function ReviewCoverage() {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<'monthly' | 'completion'>('monthly');
  const [month, setMonth] = useState(PERIOD_MONTHS[PERIOD_MONTHS.length - 1]);
  const [query, setQuery] = useState('');
  const [bucket, setBucket] = useState<Bucket | ''>('');
  const [stage, setStage] = useState<Stage | ''>('');
  const [sort, setSort] = useState(SORTS.monthly[0]);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const monthly = tab === 'monthly';
  const all = useMemo(() => (monthly ? reviewGroups(okrRows, month) : completionGroups(okrRows)), [monthly, month]);
  const q = query.trim().toLowerCase();
  const groups = sortGroups(all.filter((g) => {
    if (bucket && g.bucket !== bucket) return false;
    if (!monthly && stage && !g.rows.some((m) => m.stage === stage)) return false;
    return !q || g.name.toLowerCase().includes(q) || g.rows.some((m) => `${m.row.name} ${m.row.empId}`.toLowerCase().includes(q));
  }), sort);

  const counts = { full: 0, part: 0, none: 0 };
  for (const g of all) counts[g.bucket]++;
  const emp = { completed: 0, awaiting: 0, pending: 0 };
  for (const g of all) for (const m of g.rows) emp[m.stage]++;
  const key = (g: Group) => `${tab}:${g.name}`;
  const allOpen = groups.length > 0 && groups.every((g) => open[key(g)]);
  const filterParts = [
    bucket ? `${{ full: monthly ? 'all reviewed' : 'all completed', part: monthly ? 'partially reviewed' : 'partially completed', none: monthly ? 'none reviewed' : 'none completed' }[bucket]} managers` : '',
    !monthly && stage ? `${STAGE_META[stage].filter.toLowerCase()} reports` : '',
  ].filter(Boolean);

  const switchTab = (t: typeof tab) => {
    if (t === tab) return;
    setTab(t);
    setBucket('');
    setSort(SORTS[t][0]);
  };
  const toggleBucket = (b: Bucket) => setBucket(bucket === b ? '' : b);
  const toggleStage = (s: Stage) => setStage(stage === s ? '' : s);
  const toggleAll = () => setOpen({ ...open, ...Object.fromEntries(groups.map((g) => [key(g), !allOpen])) });
  const stageByLabel = Object.fromEntries(Object.entries(STAGE_META).map(([k, v]) => [v.filter, k as Stage]));
  const mon = MONTHS[Number(month.slice(5, 7)) - 1].slice(0, 3);

  return (
    <section className="mb-5 rounded-xl border border-[#e9ecf4] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} title="Collapse / expand this section" className="flex min-w-0 flex-wrap items-center gap-2 text-left">
          <Chevron open={!collapsed} />
          <h4 className="text-xs font-semibold tracking-[.08em] text-[#6b7280] uppercase">👤 Manager Review Coverage</h4>
          {collapsed ? (
            <span className="text-xs text-[#6b7280]">
              {monthly ? <><strong className="text-[#111827]">{monthLabel(month)}</strong> · <strong className="text-[#111827]">{counts.full}</strong> all reviewed · <strong className="text-[#111827]">{counts.part}</strong> partial · <strong className="text-[#111827]">{counts.none}</strong> none</>
                : <>Final completion · <strong className="text-[#111827]">{counts.full}</strong> of <strong className="text-[#111827]">{all.length}</strong> managers fully completed · <strong className="text-[#111827]">{emp.awaiting}</strong> awaiting completion · <strong className="text-[#111827]">{emp.pending}</strong> pending submission</>}
            </span>
          ) : null}
        </button>
        {!collapsed && groups.length ? (
          <button type="button" onClick={toggleAll} className="rounded-full border! border-[#e5e7eb]! px-4 py-1.5 text-sm font-semibold text-[#4b5563]! hover:bg-[#f9fafb]!">
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        ) : null}
      </div>

      {collapsed ? null : (
        <>
          <div className="mb-4 inline-flex rounded-full border border-[#e9ecf4] bg-white p-1">
            {([['monthly', 'Monthly Review'], ['completion', 'Final Completion']] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => switchTab(id)} aria-pressed={tab === id}
                className={`rounded-full px-3 py-2 text-[13px] font-semibold whitespace-nowrap transition sm:px-5 sm:text-sm ${tab === id ? 'bg-indigo-600! text-white!' : 'text-[#6b7280]! hover:text-[#111827]!'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {monthly ? (
            <TileGroup caption="Managers" note={`reviews marked in ${monthLabel(month)}`}>
              <Tile color={GOOD} value={counts.full} label="All reviewed" active={bucket === 'full'} onClick={() => toggleBucket('full')} title="Reviewed every report with a submitted OKR. Click to filter." />
              <Tile color={WARN} value={counts.part} label="Partially reviewed" active={bucket === 'part'} onClick={() => toggleBucket('part')} title="Reviewed some, not all, reports. Click to filter." />
              <Tile color={BAD} value={counts.none} label="None reviewed" active={bucket === 'none'} onClick={() => toggleBucket('none')} title="Has not reviewed any report. Click to filter." />
            </TileGroup>
          ) : (
            <>
              <TileGroup caption="Managers" note="marked their reports’ OKRs Completed">
                <Tile color={GOOD} value={counts.full} label="All completed" active={bucket === 'full'} onClick={() => toggleBucket('full')} title="Every report’s OKR marked Completed. Click to filter." />
                <Tile color={WARN} value={counts.part} label="Partially completed" active={bucket === 'part'} onClick={() => toggleBucket('part')} title="Some reports’ OKRs Completed. Click to filter." />
                <Tile color={BAD} value={counts.none} label="None completed" active={bucket === 'none'} onClick={() => toggleBucket('none')} title="No report’s OKR Completed yet. Click to filter." />
              </TileGroup>
              <TileGroup caption="Employees" note={`${emp.completed + emp.awaiting + emp.pending} with an OKR this period`}>
                <Tile color={GOOD} value={emp.completed} label="Completed" active={stage === 'completed'} onClick={() => toggleStage('completed')} title="Manager marked the OKR Completed. Click to filter." />
                <Tile color={WARN} value={emp.awaiting} label="Achievement submitted" active={stage === 'awaiting'} onClick={() => toggleStage('awaiting')} title="Employee submitted achievement; waiting on the manager to complete it. Click to filter." />
                <Tile color={BAD} value={emp.pending} label="Pending submission" active={stage === 'pending'} onClick={() => toggleStage('pending')} title="Achievement not submitted yet. Click to filter." />
              </TileGroup>
            </>
          )}

          {filterParts.length ? (
            <p className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[#4b5563]">
              Showing {filterParts.join(' · ')}
              <button type="button" onClick={() => { setBucket(''); setStage(''); }} className="font-semibold text-indigo-600! hover:underline">Clear filter</button>
            </p>
          ) : null}

          <FilterBar
            query={query}
            onQuery={setQuery}
            placeholder="Search manager, report or employee ID..."
            selects={[
              monthly
                ? { label: 'Month the review was marked in', value: monthLabel(month), onChange: (v) => setMonth(PERIOD_MONTHS.find((m) => monthLabel(m) === v) ?? month), options: PERIOD_MONTHS.map(monthLabel) }
                : { label: 'Completion stage', value: stage ? STAGE_META[stage].filter : 'All stages', onChange: (v) => setStage(stageByLabel[v] ?? ''), options: ['All stages', ...Object.values(STAGE_META).map((s) => s.filter)] },
              { label: 'Sort managers', value: sort, onChange: setSort, options: SORTS[tab] },
            ]}
            count={groups.length === all.length
              ? <><strong className="font-semibold text-[#111827]">{all.length}</strong> managers</>
              : <><strong className="font-semibold text-[#111827]">{groups.length}</strong> of {all.length} managers</>}
          />

          <div className="space-y-3">
            {groups.map((g, gi) => {
              const isOpen = !!open[key(g)];
              const col = band(g.pct).bar;
              const reports = `${g.total} report${g.total === 1 ? '' : 's'}`;
              const toReview = g.total - g.done - g.awaiting;
              const members = monthly || !stage ? g.rows : g.rows.filter((m) => m.stage === stage);
              return (
                <div key={g.name} className="overflow-hidden rounded-xl border border-[#e9ecf4]">
                  <button type="button" onClick={() => setOpen({ ...open, [key(g)]: !isOpen })} aria-expanded={isOpen} className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 p-4 text-left hover:bg-[#fafbfd]!">
                    <Chevron open={isOpen} />
                    <Initials name={g.name === NO_MANAGER ? 'No Reporting' : g.name} i={gi} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#111827]">{hit(g.name, q)}</span>
                      <span className="block text-xs text-[#6b7280]">
                        {reports}
                        {monthly ? <>{toReview ? ` · ${toReview} to review` : ''}{g.awaiting ? ` · ${g.awaiting} not yet approved` : ''}</>
                          : <>{g.awaiting ? <> · <span className="font-semibold text-amber-600">{g.awaiting} awaiting completion</span></> : null}{g.pending ? ` · ${g.pending} pending submission` : ''}</>}
                      </span>
                    </span>
                    <span className="basis-full text-right sm:basis-auto sm:w-44 sm:shrink-0">
                      <span className="block text-base font-bold tabular-nums" style={{ color: col }}>{g.done} / {g.total}</span>
                      <span className="my-1 block h-1.5 w-full overflow-hidden rounded-full bg-[#eef1f7]"><span className="block h-full rounded-full" style={{ width: `${g.pct}%`, background: col }} /></span>
                      <span className="block text-[10px] font-semibold tracking-[.06em] text-[#6b7280] uppercase">{g.pct}% {monthly ? `reviewed in ${mon}` : 'completed'}</span>
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="overflow-x-auto border-t border-[#eef1f7]">
                      <table className="w-full min-w-200 border-collapse">
                        <thead>
                          <tr className="border-b border-[#eef1f7]">
                            {(monthly ? ['Employee', 'Department', 'OKR status', monthLabel(month), 'Review history', 'Reviewed on'] : ['Employee', 'Department', 'OKR status', 'Stage', 'Achievement submitted', 'Completed on']).map((h) => (
                              <th key={h} scope="col" className="px-4 py-3 text-left text-[11px] font-semibold tracking-[.08em] text-[#6b7280] uppercase">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {members.map((m, i) => {
                            const dim = monthly ? !m.reviewed : m.stage === 'pending';
                            const history = [...new Set((m.row.reviews ?? []).map((d) => d.slice(0, 7)))].sort().reverse();
                            return (
                              <tr key={m.row.empId} className="border-b border-[#f3f4f6] last:border-0">
                                <td className="px-4 py-3">
                                  <span className="flex items-center gap-2.5">
                                    <Initials name={m.row.name} i={i} dim={dim} />
                                    <span className="min-w-0">
                                      <span className="block text-sm font-semibold whitespace-nowrap text-[#111827]">{hit(m.row.name, q)}</span>
                                      <span className="block text-xs whitespace-nowrap text-[#6b7280]">{hit(m.row.empId, q)}</span>
                                    </span>
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-[#4b5563]">{m.row.department}</td>
                                <td className="px-4 py-3"><Pill hex={APPROVAL_COLOR[m.row.status]}>{m.row.status}</Pill></td>
                                {monthly ? (
                                  <>
                                    <td className="px-4 py-3">
                                      {m.reviewed ? <Pill hex={GOOD}>✓ Reviewed</Pill> : !m.reviewable ? <Pill hex="#94a3b8">{NOT_REVIEWABLE_LABEL[m.row.status] ?? 'Not yet approved'}</Pill> : <Pill hex={BAD}>Not reviewed</Pill>}
                                    </td>
                                    <td className="px-4 py-3">
                                      {history.length ? (
                                        <span className="flex flex-wrap gap-1">
                                          {history.map((ym) => (
                                            <span key={ym} title={`Marked on ${fmtDate((m.row.reviews ?? []).filter((d) => d.startsWith(ym)).sort().at(-1) ?? '')}`}
                                              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-emerald-700 ${ym === month ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' : 'border-emerald-300 bg-emerald-50'}`}
                                            >
                                              {monthLabel(ym)}
                                            </span>
                                          ))}
                                        </span>
                                      ) : <span className="text-[#9ca3af]">—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-sm whitespace-nowrap text-[#4b5563]">{fmtDate(m.latest) || <span className="text-[#9ca3af]">—</span>}</td>
                                  </>
                                ) : (
                                  <>
                                    <td className="px-4 py-3"><Pill hex={STAGE_META[m.stage].hex}>{STAGE_META[m.stage].label}</Pill></td>
                                    <td className="px-4 py-3 text-sm whitespace-nowrap text-[#4b5563]">{(m.stage !== 'pending' && fmtDate(m.row.submittedOn ?? '')) || <span className="text-[#9ca3af]">—</span>}</td>
                                    <td className="px-4 py-3 text-sm whitespace-nowrap text-[#4b5563]">{(m.stage === 'completed' && fmtDate(m.row.completedOn ?? '')) || <span className="text-[#9ca3af]">—</span>}</td>
                                  </>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#6b7280]">{q ? `No manager or report matches “${query.trim()}”.` : 'No managers match the selected filter.'}</p>
          ) : null}
        </>
      )}
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
          <span className="rounded-lg border border-[#e9ecf4] bg-white px-3 py-2 text-sm font-medium">
            {okrPeriod}
          </span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-[#e9ecf4] bg-white px-3 py-2 text-sm text-[#374151]">
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
            aria-pressed={tab === id}
            className={`rounded-full px-3 py-2 text-[13px] font-semibold whitespace-nowrap transition sm:px-5 sm:text-sm ${tab === id ? 'bg-indigo-600! text-white!' : 'text-[#6b7280]! hover:text-[#111827]!'}`}
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
                <p className="mt-0.5 text-xs text-[#6b7280]">{note}</p>
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
                      <span className="mt-1 block text-[10px] font-semibold tracking-[.06em] text-[#6b7280] uppercase">
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
                  <li key={r.empId} className="flex items-center gap-3 rounded-xl border border-[#e9ecf4] p-3">
                    <span className="w-6 shrink-0 text-center text-xs font-bold text-red-600">#{i + 1}</span>
                    <Initials name={r.name} i={i + 3} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#111827]">{r.name}</span>
                      <span className="block text-xs text-[#6b7280]">{r.department}</span>
                    </span>
                    <span className="w-20 shrink-0 text-right sm:w-28">
                      <span className="block text-sm font-bold text-red-600 tabular-nums">{r.progress}%</span>
                      <Bar value={r.progress} />
                      <span className="mt-1 block text-[10px] font-semibold tracking-[.06em] text-[#6b7280] uppercase">
                        {r.achieved}/{r.set} achieved
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <ReviewCoverage />

          <Card title="Employee OKRs">
            <FilterBar
              query={query}
              onQuery={setQuery}
              placeholder="Search employee, ID or manager..."
              selects={[
                { label: 'Department', value: dept, onChange: setDept, options: ['All departments', ...deptNames] },
                { label: 'Approval status', value: status, onChange: setStatus, options: ['All statuses', ...APPROVALS] },
              ]}
              count={
                <>
                  Showing <strong className="font-semibold text-[#111827]">{rows.length}</strong> of {okrRows.length}
                </>
              }
            />
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-200 border-collapse">
                <thead>
                  <tr className="border-b border-[#eef1f7]">
                    {['Employee', 'Department', 'Manager', 'Set', 'Achieved', 'Progress', 'Progress status', 'Status'].map((h) => (
                      <th key={h} scope="col" className="px-3 py-3 text-left text-[11px] font-semibold tracking-[.08em] text-[#6b7280] uppercase">
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
                            <span className="block text-xs text-[#6b7280]">{r.empId}</span>
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
              <p className="py-10 text-center text-sm text-[#6b7280]">No employees match those filters.</p>
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
                          <th key={h} scope="col" className="px-3 py-2.5 text-left text-[11px] font-semibold tracking-[.08em] text-[#6b7280] uppercase">
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
                                  <span className="block text-xs text-[#6b7280]">{m.empId}</span>
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
