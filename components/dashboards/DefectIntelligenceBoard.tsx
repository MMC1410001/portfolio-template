'use client';
/**
 * Recreation of the defect intelligence board.
 *
 * ── Every number on screen comes from the rows on screen ──────────────────
 * The KPI tiles, the platform counts in the rail, all six charts and the risk
 * assessment are computed from `defectRows` and nothing else. The original
 * runs on a far larger log and this recreation carries a subset, so the one
 * thing that could not be allowed is a tile quoting the real volume above a
 * table that cannot add up to it. The real figure appears once, in the
 * footer, described as what it is.
 *
 * ── The risk verdict is a rule, not a mood ────────────────────────────────
 * `assess()` states the release position from open criticals, open highs and
 * the open ratio, in that order, and the banner prints the reason beside the
 * verdict. This is the part of the dashboard that gets quoted in a meeting,
 * so it has to be reproducible: two people reading the same log should reach
 * the same words, and a rule is the only way that happens.
 *
 * ── Rail items are views and filters at once ──────────────────────────────
 * "Open bugs · 12" in the rail is both a page and a preset, clicking it
 * filters the table and repoints every chart. That is how the original
 * behaves and it is why the filter row and the rail have to share one piece
 * of state rather than each holding their own.
 */
import { useMemo, useState } from 'react';
import {
  defectRows,
  DEFECT_TOTAL,
  type DefectRow,
  type Severity,
} from '@/content/dashboards-demo';
import {
  Donut,
  HBars,
  Legend,
  SEVERITY_COLOR,
  share,
  STATE_COLOR,
} from './charts';
import { DashNote, RailShell, type RailItem } from './shell';

type View = 'dashboard' | 'analytics' | 'risk' | 'team';
type Preset = 'all' | 'open' | 'critical';

const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low'];

const SEV_PILL: Record<Severity, string> = {
  Critical: 'bg-red-50 text-red-700',
  High: 'bg-amber-50 text-amber-700',
  Medium: 'bg-blue-50 text-blue-700',
  Low: 'bg-emerald-50 text-emerald-700',
};

const PRI_PILL: Record<string, string> = {
  P0: 'bg-red-50 text-red-700',
  P1: 'bg-amber-50 text-amber-700',
  P2: 'bg-slate-100 text-slate-600',
};

function tally<T extends string>(rows: DefectRow[], pick: (r: DefectRow) => T) {
  const m = new Map<T, number>();
  for (const r of rows) m.set(pick(r), (m.get(pick(r)) ?? 0) + 1);
  return m;
}

/** Release position, in priority order. The banner prints `why` verbatim. */
function assess(rows: DefectRow[]) {
  const open = rows.filter((r) => r.status === 'Open');
  const criticalOpen = open.filter((r) => r.severity === 'Critical').length;
  const highOpen = open.filter((r) => r.severity === 'High').length;
  const p0Open = open.filter((r) => r.priority === 'P0').length;
  const ratio = rows.length ? Math.round((open.length / rows.length) * 100) : 0;
  const level =
    criticalOpen > 0 ? 'HIGH RISK' : highOpen > 0 ? 'MEDIUM RISK' : 'LOW RISK';
  const why =
    criticalOpen > 0
      ? 'Critical severity issues are still open'
      : highOpen > 0
        ? 'High severity issues need attention'
        : 'No critical or high severity issues open';
  return { level, why, criticalOpen, highOpen, p0Open, ratio, open: open.length };
}

function Kpi({
  value,
  label,
  note,
  tone,
  badge,
}: {
  value: string | number;
  label: string;
  note: string;
  tone: string;
  badge?: string;
}) {
  return (
    <div className="rounded-xl border border-[#e9ecf4] bg-white p-4">
      <p className={`text-3xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 text-sm font-semibold text-[#111827]">{label}</p>
      <p className="text-xs text-[#9ca3af]">{note}</p>
      {badge ? (
        <span className="mt-2 inline-block rounded-md bg-[#f3f4f6] px-1.5 py-0.5 text-[11px] font-semibold text-[#4b5563] tabular-nums">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#e9ecf4] bg-white p-5">
      <h4 className="text-sm font-bold text-[#111827]">{title}</h4>
      <p className="mb-4 text-xs text-[#9ca3af]">{sub}</p>
      {children}
    </section>
  );
}

export function DefectIntelligenceBoard() {
  const [view, setView] = useState<View>('dashboard');
  const [preset, setPreset] = useState<Preset>('all');
  const [platform, setPlatform] = useState('All platforms');
  const [severity, setSeverity] = useState('All severities');
  const [query, setQuery] = useState('');

  const platforms = useMemo(() => [...tally(defectRows, (r) => r.platform)], []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return defectRows.filter((r) => {
      if (preset === 'open' && r.status !== 'Open') return false;
      if (preset === 'critical' && r.severity !== 'Critical') return false;
      if (platform !== 'All platforms' && r.platform !== platform) return false;
      if (severity !== 'All severities' && r.severity !== severity) return false;
      if (!q) return true;
      return `${r.id} ${r.title} ${r.module} ${r.assignee}`
        .toLowerCase()
        .includes(q);
    });
  }, [preset, platform, severity, query]);

  const risk = assess(rows);
  const closed = rows.filter((r) => r.status === 'Closed').length;
  const closure = rows.length ? Math.round((closed / rows.length) * 100) : 0;

  const bySeverity = SEVERITIES.map((s) => ({
    label: s,
    value: rows.filter((r) => r.severity === s).length,
    color: SEVERITY_COLOR[s],
  }));
  const byPriority = ['P0', 'P1', 'P2'].map((p) => ({
    label: p,
    value: rows.filter((r) => r.priority === p).length,
    color: p === 'P0' ? '#dc2626' : p === 'P1' ? '#ea8c1f' : '#8b5cf6',
  }));
  const byState = [
    { label: 'Closed', value: closed, color: STATE_COLOR.closed },
    { label: 'Open', value: rows.length - closed, color: STATE_COLOR.open },
  ];
  const byType = (['Bug', 'Observation', 'Enhancement'] as const).map((t) => ({
    label: t,
    value: rows.filter((r) => r.type === t).length,
    color:
      t === 'Bug'
        ? STATE_COLOR.bug
        : t === 'Observation'
          ? STATE_COLOR.observation
          : STATE_COLOR.enhancement,
  }));
  const byAssignee = [...tally(rows, (r) => r.assignee)]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, color: '#2f3a4f' }));
  const byPlatform = [...tally(rows, (r) => r.platform)]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, color: '#3b4a63' }));

  const items: RailItem[] = [
    { id: 'dashboard', label: 'Dashboard', heading: 'Home' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'risk', label: 'Risk report' },
    { id: 'team', label: 'Team' },
    {
      id: 'p:open',
      label: 'Open bugs',
      heading: 'Bug reports',
      badge: <Badge n={defectRows.filter((r) => r.status === 'Open').length} />,
    },
    {
      id: 'p:critical',
      label: 'Critical',
      badge: <Badge n={defectRows.filter((r) => r.severity === 'Critical').length} />,
    },
    { id: 'p:all', label: 'All issues', badge: <Badge n={defectRows.length} /> },
    ...platforms
      .sort((a, b) => b[1] - a[1])
      .map(([name, n], i) => ({
        id: `f:${name}`,
        label: name,
        heading: i === 0 ? 'Platforms' : undefined,
        badge: <Badge n={n} tone="bg-emerald-500/90" />,
      })),
  ];

  const active =
    view !== 'dashboard' || preset !== 'all'
      ? platform !== 'All platforms'
        ? `f:${platform}`
        : preset !== 'all'
          ? `p:${preset}`
          : view
      : platform !== 'All platforms'
        ? `f:${platform}`
        : 'dashboard';

  function select(id: string) {
    if (id.startsWith('p:')) {
      setPreset(id.slice(2) as Preset);
      setPlatform('All platforms');
      setView('dashboard');
      return;
    }
    if (id.startsWith('f:')) {
      setPlatform(id.slice(2));
      setView('dashboard');
      return;
    }
    setView(id as View);
    setPreset('all');
    setPlatform('All platforms');
  }

  const charts = (
    <>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="By severity" sub="Critical · High · Medium · Low">
          <div className="flex flex-col items-center gap-4">
            <Donut segments={bySeverity} size={150} />
            <Legend inline segments={bySeverity} />
          </div>
        </Card>
        <Card title="By priority" sub="P0 · P1 · P2">
          <HBars data={byPriority} labelWidth="w-10" />
        </Card>
        <Card title="Open vs closed" sub="Resolution status">
          <div className="flex flex-col items-center gap-4">
            <Donut segments={byState} size={150} />
            <Legend inline segments={byState} />
          </div>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="By assignee" sub="Top contributors">
          <HBars data={byAssignee} labelWidth="w-20" />
        </Card>
        <Card title="By platform" sub="All platforms">
          <HBars data={byPlatform} labelWidth="w-28" />
        </Card>
        <Card title="Defect type" sub="Bug · Observation · Enhancement">
          <div className="flex flex-col items-center gap-4">
            <Donut segments={byType} size={150} />
            <Legend inline segments={byType} />
          </div>
        </Card>
      </div>
    </>
  );

  const riskStrip = (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div className="rounded-xl border-t-4 border-amber-400 bg-amber-50 p-4 sm:col-span-2 xl:col-span-1">
        <p className="text-lg font-bold text-amber-700">{risk.level}</p>
        <p className="mt-0.5 text-xs text-amber-800">{risk.why}</p>
        <p className="mt-2 text-xs text-amber-900">
          Critical open: <strong>{risk.criticalOpen}</strong> · High open:{' '}
          <strong>{risk.highOpen}</strong> · Open: <strong>{risk.ratio}%</strong>
        </p>
      </div>
      {[
        [risk.criticalOpen, 'Critical open', 'border-red-400 bg-red-50 text-red-700'],
        [risk.highOpen, 'High open', 'border-amber-400 bg-amber-50 text-amber-700'],
        [risk.p0Open, 'P0 open', 'border-red-400 bg-red-50 text-red-700'],
        [`${risk.ratio}%`, 'Open ratio', 'border-amber-400 bg-amber-50 text-amber-700'],
      ].map(([value, label, cls]) => (
        <div key={String(label)} className={`rounded-xl border-t-4 p-4 text-center ${cls}`}>
          <p className="text-3xl font-bold tabular-nums">{value}</p>
          <p className="mt-1 text-xs font-semibold tracking-[.06em] uppercase">{label}</p>
        </div>
      ))}
    </section>
  );

  return (
    <>
      <RailShell
        tone="terracotta"
        brand={
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/25 text-xs font-bold">
              DI
            </span>
            <span className="text-sm font-bold">Defect intelligence</span>
          </div>
        }
        items={items}
        active={active}
        onSelect={select}
        footer={
          <>
            {defectRows.length} records loaded
            <span className="mt-2 block rounded-lg bg-white/20 px-3 py-2 text-center text-xs font-semibold">
              ✉ Send report
            </span>
          </>
        }
      >
        <header className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-[#111827]">
              {view === 'analytics'
                ? 'Analytics'
                : view === 'risk'
                  ? 'Risk report'
                  : view === 'team'
                    ? 'Team'
                    : 'Dashboard'}
            </h3>
            <p className="text-sm text-[#9ca3af]">
              Defect log /{' '}
              {preset === 'open'
                ? 'Status: open'
                : preset === 'critical'
                  ? 'Severity: critical'
                  : platform !== 'All platforms'
                    ? platform
                    : 'Overview'}
            </p>
          </div>
          <span className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">
            {risk.level}
          </span>
        </header>

        {view !== 'team' ? (
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi value={rows.length} label="Total issues" note="Matching rows" tone="text-[#111827]" />
            <Kpi value={risk.open} label="Open" note={`${risk.ratio}% unresolved`} tone="text-red-600" badge={`↑${risk.ratio}%`} />
            <Kpi value={closed} label="Closed" note={`${closure}% closure rate`} tone="text-emerald-600" badge={`✓ ${closure}%`} />
            <Kpi value={rows.filter((r) => r.severity === 'Critical').length} label="Critical" note="Severity: critical" tone="text-red-600" />
          </div>
        ) : null}

        {view === 'dashboard' ? (
          <>
            <section className="mb-5 rounded-xl border border-[#e9ecf4] bg-white p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-50 flex-1">
                  <span className="mb-1 block text-[11px] font-semibold tracking-[.08em] text-[#9ca3af] uppercase">Search</span>
                  <input
                    value={query}
                    onChange={(ev) => setQuery(ev.target.value)}
                    placeholder="Search ID, title, module..."
                    className="w-full rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-sm outline-none placeholder:text-[#9ca3af] focus:border-indigo-400"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-[11px] font-semibold tracking-[.08em] text-[#9ca3af] uppercase">Platform</span>
                  <select
                    value={platform}
                    onChange={(ev) => setPlatform(ev.target.value)}
                    className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-sm outline-none focus:border-indigo-400"
                  >
                    {['All platforms', ...platforms.map(([n]) => n)].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-[11px] font-semibold tracking-[.08em] text-[#9ca3af] uppercase">Severity</span>
                  <select
                    value={severity}
                    onChange={(ev) => setSeverity(ev.target.value)}
                    className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-sm outline-none focus:border-indigo-400"
                  >
                    {['All severities', ...SEVERITIES].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setPlatform('All platforms');
                    setSeverity('All severities');
                    setPreset('all');
                  }}
                  className="rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm text-[#6b7280] hover:bg-[#f9fafb]"
                >
                  ↺ Reset
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {[...bySeverity, ...byPriority, ...byType].map((s) => (
                  <span key={s.label} className="rounded-lg border border-[#e9ecf4] px-3 py-1.5 text-center">
                    <span className="block text-base font-bold tabular-nums" style={{ color: s.color }}>{s.value}</span>
                    <span className="block text-[10px] font-semibold tracking-[.06em] text-[#9ca3af] uppercase">{s.label}</span>
                  </span>
                ))}
              </div>
            </section>
            {charts}
            <div className="mt-5">{riskStrip}</div>
          </>
        ) : null}

        {view === 'analytics' ? charts : null}
        {view === 'risk' ? riskStrip : null}
        {view === 'team' ? (
          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="By assignee" sub="Bug count per person">
              <HBars data={byAssignee} labelWidth="w-20" />
            </Card>
            <Card title="By severity" sub="Severity distribution">
              <div className="flex flex-col items-center gap-4">
                <Donut segments={bySeverity} size={150} />
                <Legend inline segments={bySeverity} />
              </div>
            </Card>
            <Card title="By status" sub="Open vs closed">
              <div className="flex flex-col items-center gap-4">
                <Donut segments={byState} size={150} />
                <Legend inline segments={byState} />
              </div>
            </Card>
          </div>
        ) : null}

        <section className="mt-5 rounded-xl border border-[#e9ecf4] bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h4 className="text-sm font-bold text-[#111827]">Bug list</h4>
            <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-xs font-semibold text-[#4b5563] tabular-nums">
              {rows.length} bugs
            </span>
          </div>
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-200 border-collapse">
              <thead>
                <tr className="border-b border-[#eef1f7]">
                  {['Bug ID', 'Platform', 'Module', 'Severity', 'Priority', 'Title', 'Assignee', 'Status', 'Type'].map((h) => (
                    <th key={h} scope="col" className="px-3 py-3 text-left text-[11px] font-semibold tracking-[.08em] text-[#9ca3af] uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[#f3f4f6] hover:bg-[#fafbfd]">
                    <td className="px-3 py-3 text-sm font-semibold text-indigo-600">{r.id}</td>
                    <td className="px-3 py-3 text-sm text-[#4b5563]">{r.platform}</td>
                    <td className="px-3 py-3 text-sm text-[#4b5563]">{r.module}</td>
                    <td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-[11px] font-bold ${SEV_PILL[r.severity]}`}>{r.severity.toUpperCase()}</span></td>
                    <td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-[11px] font-bold ${PRI_PILL[r.priority]}`}>{r.priority}</span></td>
                    <td className="px-3 py-3 text-sm text-[#111827]">{r.title}</td>
                    <td className="px-3 py-3 text-sm text-[#4b5563]">{r.assignee}</td>
                    <td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-[11px] font-bold ${r.status === 'Closed' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{r.status.toUpperCase()}</span></td>
                    <td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-[11px] font-bold ${r.type === 'Bug' ? 'bg-red-50 text-red-700' : r.type === 'Observation' ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'}`}>{r.type.toUpperCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#9ca3af]">No defects match those filters.</p>
          ) : null}
        </section>
      </RailShell>
      <DashNote>
        Recreation on synthetic data · {defectRows.length} of the original&rsquo;s {DEFECT_TOTAL} records · every figure above is computed from the {rows.length} rows currently shown ({share(rows.length, defectRows.length)} of the set)
      </DashNote>
    </>
  );
}

function Badge({ n, tone = 'bg-white/25' }: { n: number; tone?: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${tone}`}>
      {n}
    </span>
  );
}
