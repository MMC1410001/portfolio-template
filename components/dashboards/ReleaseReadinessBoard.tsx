'use client';
/**
 * Recreation of the release readiness bug report.
 *
 * ── The verdict is the deliverable ────────────────────────────────────────
 * Every other dashboard here reports state and leaves the decision to a
 * meeting. This one makes the call (go, conditional go, or no-go) and the
 * banner is the top of the page rather than a conclusion at the bottom,
 * because the people opening it are deciding whether to ship this afternoon.
 *
 * ── …so the rule is printed next to it ────────────────────────────────────
 * `verdict()` evaluates open criticals first, then open highs, then reopened
 * regressions, and returns the sentence that goes under the banner along with
 * the call. Publishing a verdict without the rule that produced it is how a
 * dashboard becomes something to argue with rather than something to act on;
 * publishing the rule means a reader can disagree with the threshold instead
 * of with the tool.
 *
 * ── Invalid is a state, not a deletion ────────────────────────────────────
 * Two records here are marked invalid: raised, triaged, rejected. They stay
 * in the table and stay out of the verdict, because a bug list that silently
 * drops what QA got wrong loses the only evidence that triage happened.
 */
import { useMemo, useState } from 'react';
import {
  readinessFeature,
  readinessRows,
  READINESS_TOTAL,
  type ReadinessRow,
  type Severity,
} from '@/content/dashboards-demo';
import { Donut, HBars, Legend, SEVERITY_COLOR, STATE_COLOR } from './charts';
import { DashNote, RailShell, type RailItem } from './shell';

type View = 'dashboard' | 'analytics' | 'risk';
type Preset = 'all' | 'open' | 'critical';

const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low'];

const QA_COLOR = {
  Closed: STATE_COLOR.closed,
  Open: STATE_COLOR.open,
  Reopened: STATE_COLOR.reopened,
  Invalid: STATE_COLOR.invalid,
} as const;

const SEV_PILL: Record<Severity, string> = {
  Critical: 'bg-red-50 text-red-700',
  High: 'bg-amber-50 text-amber-700',
  Medium: 'bg-blue-50 text-blue-700',
  Low: 'bg-emerald-50 text-emerald-700',
};

/** Open means counting toward the verdict: invalid and closed do not. */
const isOpen = (r: ReadinessRow) =>
  r.qaStatus === 'Open' || r.qaStatus === 'Reopened';

function verdict(rows: ReadinessRow[]) {
  const open = rows.filter(isOpen);
  const criticals = open.filter((r) => r.severity === 'Critical').length;
  const highs = open.filter((r) => r.severity === 'High').length;
  const reopened = rows.filter((r) => r.qaStatus === 'Reopened').length;
  if (criticals > 0)
    return {
      call: 'NO-GO',
      risk: 'High',
      why: `${criticals} open critical-severity bug${criticals > 1 ? 's' : ''}. Do not release.`,
      tone: 'from-[#c0392b] to-[#e05c4a]',
    };
  if (highs > 0)
    return {
      call: 'CONDITIONAL GO',
      risk: 'Medium',
      why: `Open high-severity bug${highs > 1 ? 's' : ''} exist. Proceed only with business sign-off.`,
      tone: 'from-[#c07818] to-[#e0a33a]',
    };
  if (reopened > 0)
    return {
      call: 'CONDITIONAL GO',
      risk: 'Low',
      why: `${reopened} regression${reopened > 1 ? 's' : ''} reopened this cycle. Confirm the fix held before release.`,
      tone: 'from-[#c07818] to-[#e0a33a]',
    };
  return {
    call: 'GO',
    risk: 'Low',
    why: 'No open critical or high-severity bugs, and no reopened regressions.',
    tone: 'from-[#1f7a4d] to-[#35a86c]',
  };
}

function Tile({
  label,
  value,
  note,
  color,
}: {
  label: string;
  value: number;
  note: string;
  color: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#e4e8f0] bg-white">
      <div className="p-4">
        <p className="text-[11px] font-semibold tracking-[.08em] text-[#6b7280] uppercase">{label}</p>
        <p className="mt-1 text-3xl font-bold text-[#111827] tabular-nums">{value}</p>
        <p className="text-xs text-[#9ca3af]">{note}</p>
      </div>
      <span className="block h-1" style={{ background: color }} />
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#e4e8f0] bg-white p-5">
      <h4 className="mb-4 text-xs font-semibold tracking-[.08em] text-[#6b7280] uppercase">
        {title}
      </h4>
      {children}
    </section>
  );
}

export function ReleaseReadinessBoard() {
  const [view, setView] = useState<View>('dashboard');
  const [preset, setPreset] = useState<Preset>('all');
  const [severity, setSeverity] = useState('All');
  const [module, setModule] = useState('All');
  const [query, setQuery] = useState('');

  const modules = useMemo(
    () => [...new Set(readinessRows.map((r) => r.module))].sort(),
    [],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return readinessRows.filter((r) => {
      if (preset === 'open' && !isOpen(r)) return false;
      if (preset === 'critical' && r.severity !== 'Critical') return false;
      if (severity !== 'All' && r.severity !== severity) return false;
      if (module !== 'All' && r.module !== module) return false;
      if (!q) return true;
      return `${r.id} ${r.summary}`.toLowerCase().includes(q);
    });
  }, [preset, severity, module, query]);

  // The call is always made on the whole log, never on the filtered view: a
  // release decision that changes when someone picks a module is not a
  // decision.
  const v = verdict(readinessRows);

  const counts = {
    total: rows.length,
    open: rows.filter((r) => r.qaStatus === 'Open').length,
    closed: rows.filter((r) => r.qaStatus === 'Closed').length,
    reopened: rows.filter((r) => r.qaStatus === 'Reopened').length,
    invalid: rows.filter((r) => r.qaStatus === 'Invalid').length,
  };
  const closure = rows.length ? Math.round((counts.closed / rows.length) * 100) : 0;

  const bySeverity = SEVERITIES.map((s) => ({
    label: s,
    value: rows.filter((r) => r.severity === s).length,
    color: SEVERITY_COLOR[s],
  }));
  const byQa = (['Closed', 'Open', 'Reopened', 'Invalid'] as const)
    .map((s) => ({
      label: s,
      value: rows.filter((r) => r.qaStatus === s).length,
      color: QA_COLOR[s],
    }))
    .filter((s) => s.value > 0);
  const byPriority = [...new Set(readinessRows.map((r) => r.priority))].map((p) => ({
    label: p,
    value: rows.filter((r) => r.priority === p).length,
    color: p.startsWith('P0') ? '#dc2626' : p === 'High' ? '#7c3aed' : '#3b82f6',
  }));
  const byModule = modules
    .map((m) => ({ label: m, value: rows.filter((r) => r.module === m).length, color: '#6d5bd0' }))
    .sort((a, b) => b.value - a.value);

  const items: RailItem[] = [
    { id: 'dashboard', label: 'Dashboard', heading: 'Home' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'risk', label: 'Risk report' },
    {
      id: 'p:open',
      label: 'Open bugs',
      heading: 'Bug reports',
      badge: <Badge n={readinessRows.filter(isOpen).length} />,
    },
    {
      id: 'p:critical',
      label: 'Critical',
      badge: <Badge n={readinessRows.filter((r) => r.severity === 'Critical').length} />,
    },
    { id: 'p:all', label: 'All issues', badge: <Badge n={readinessRows.length} /> },
  ];

  function select(id: string) {
    if (id.startsWith('p:')) {
      setPreset(id.slice(2) as Preset);
      setView('dashboard');
      return;
    }
    setView(id as View);
    setPreset('all');
  }

  const charts = (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card title="By severity">
        <div className="flex flex-col items-center gap-4">
          <Donut segments={bySeverity} size={150} />
          <Legend inline segments={bySeverity} />
        </div>
      </Card>
      <Card title="By priority">
        <HBars data={byPriority} labelWidth="w-28" />
      </Card>
      <Card title="By QA status">
        <div className="flex flex-col items-center gap-4">
          <Donut segments={byQa} size={150} />
          <Legend inline segments={byQa} />
        </div>
      </Card>
      <Card title="By module">
        <HBars data={byModule} labelWidth="w-28" />
      </Card>
    </div>
  );

  return (
    <>
      <RailShell
        tone="teal"
        brand={
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/25 text-xs font-bold">
              QA
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">Release readiness</span>
              <span className="block text-xs opacity-80">QA dashboard</span>
            </span>
          </div>
        }
        items={items}
        active={preset !== 'all' ? `p:${preset}` : view}
        onSelect={select}
        footer={<>QA environment · view only</>}
      >
        <section
          className={`mb-5 rounded-2xl bg-gradient-to-r p-6 text-white ${v.tone}`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-2xl font-bold tracking-tight">{v.call}</h3>
            <span className="rounded-full bg-white/25 px-3 py-1 text-xs font-bold">
              Risk: {v.risk}
            </span>
          </div>
          <p className="mt-2 text-sm text-white/90">{v.why}</p>
          <p className="mt-3 text-xs text-white/70">
            {readinessFeature} · the call is evaluated over all {readinessRows.length} records, not the current filter
          </p>
        </section>

        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <Tile label="Total bugs" value={counts.total} note="All records" color="#6d5bd0" />
          <Tile label="Open" value={counts.open} note="Unresolved" color="#ef4444" />
          <Tile label="Closed" value={counts.closed} note={`${closure}% closure`} color="#22c55e" />
          <Tile label="Reopened" value={counts.reopened} note="Regressions" color="#f59e0b" />
          <Tile label="Invalid" value={counts.invalid} note="Rejected at triage" color="#eab308" />
        </div>

        {view === 'dashboard' ? (
          <>
            <section className="mb-5 rounded-xl border border-[#e4e8f0] bg-white p-4">
              <p className="mb-3 text-xs font-semibold tracking-[.08em] text-[#6b7280] uppercase">
                Filters
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-50 flex-1">
                  <span className="mb-1 block text-[11px] font-semibold text-[#9ca3af]">Search</span>
                  <input
                    value={query}
                    onChange={(ev) => setQuery(ev.target.value)}
                    placeholder="Search bug ID, summary..."
                    className="w-full rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-sm outline-none placeholder:text-[#9ca3af] focus:border-teal-500"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-[11px] font-semibold text-[#9ca3af]">Severity</span>
                  <select
                    value={severity}
                    onChange={(ev) => setSeverity(ev.target.value)}
                    className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-sm outline-none focus:border-teal-500"
                  >
                    {['All', ...SEVERITIES].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-[11px] font-semibold text-[#9ca3af]">Module</span>
                  <select
                    value={module}
                    onChange={(ev) => setModule(ev.target.value)}
                    className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-sm outline-none focus:border-teal-500"
                  >
                    {['All', ...modules].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setSeverity('All');
                    setModule('All');
                    setPreset('all');
                  }}
                  className="rounded-lg bg-[#5b4bd0] px-4 py-2 text-sm font-medium text-white hover:bg-[#4c3fb8]"
                >
                  ↺ Reset
                </button>
              </div>
            </section>
            {charts}
          </>
        ) : null}

        {view === 'analytics' ? charts : null}

        {view === 'risk' ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="How the call is made">
              <ol className="space-y-3 text-sm text-[#374151]">
                <li className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-red-100 text-xs font-bold text-red-700">1</span>
                  Any open critical-severity bug → <strong>NO-GO</strong>.
                </li>
                <li className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">2</span>
                  Otherwise, any open high-severity bug → <strong>CONDITIONAL GO</strong>, business sign-off required.
                </li>
                <li className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">3</span>
                  Otherwise, any reopened regression → <strong>CONDITIONAL GO</strong>, confirm the fix held.
                </li>
                <li className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">4</span>
                  Otherwise → <strong>GO</strong>.
                </li>
              </ol>
              <p className="mt-4 border-t border-[#f3f4f6] pt-3 text-xs text-[#9ca3af]">
                Records marked invalid are excluded from every step: they were raised, triaged and rejected, and they stay in the table as evidence that triage happened.
              </p>
            </Card>
            <Card title="Against this log">
              <ul className="space-y-2.5 text-sm">
                {[
                  ['Open critical', readinessRows.filter((r) => isOpen(r) && r.severity === 'Critical').length, '#dc2626'],
                  ['Open high', readinessRows.filter((r) => isOpen(r) && r.severity === 'High').length, '#ea8c1f'],
                  ['Reopened regressions', readinessRows.filter((r) => r.qaStatus === 'Reopened').length, '#f59e0b'],
                  ['Invalid (excluded)', readinessRows.filter((r) => r.qaStatus === 'Invalid').length, '#9ca3af'],
                ].map(([label, n, color]) => (
                  <li key={String(label)} className="flex items-center justify-between gap-3 rounded-lg bg-[#f9fafb] px-3 py-2.5">
                    <span className="flex items-center gap-2 text-[#374151]">
                      <span className="size-2.5 rounded-[3px]" style={{ background: String(color) }} />
                      {label}
                    </span>
                    <strong className="text-[#111827] tabular-nums">{n}</strong>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ) : null}

        <section className="mt-5 rounded-xl border border-[#e4e8f0] bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h4 className="text-xs font-semibold tracking-[.08em] text-[#6b7280] uppercase">Bug records</h4>
            <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-xs font-semibold text-[#4b5563] tabular-nums">
              {rows.length} bugs
            </span>
          </div>
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-200 border-collapse">
              <thead>
                <tr className="border-b border-[#eef1f7]">
                  {['Bug ID', 'Summary', 'Severity', 'Priority', 'Module', 'Dev status', 'QA status'].map((h) => (
                    <th key={h} scope="col" className="px-3 py-3 text-left text-[11px] font-semibold tracking-[.08em] text-[#9ca3af] uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[#f3f4f6] align-top hover:bg-[#fafbfd]">
                    <td className="px-3 py-3.5 text-sm font-bold text-[#111827]">{r.id}</td>
                    <td className="px-3 py-3.5 text-sm text-[#374151]">{r.summary}</td>
                    <td className="px-3 py-3.5"><span className={`rounded-md px-2 py-1 text-[11px] font-bold ${SEV_PILL[r.severity]}`}>{r.severity}</span></td>
                    <td className="px-3 py-3.5 text-sm text-[#4b5563]">{r.priority}</td>
                    <td className="px-3 py-3.5 text-sm text-[#4b5563]">{r.module}</td>
                    <td className="px-3 py-3.5">
                      <span className={`rounded-md px-2 py-1 text-[11px] font-bold ${r.devStatus === 'Close' ? 'bg-emerald-50 text-emerald-700' : r.devStatus === 'Open' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                        {r.devStatus}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span
                        className="rounded-md px-2 py-1 text-[11px] font-bold"
                        style={{ background: `${QA_COLOR[r.qaStatus]}1f`, color: QA_COLOR[r.qaStatus] }}
                      >
                        {r.qaStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#9ca3af]">No bugs match those filters.</p>
          ) : null}
        </section>
      </RailShell>
      <DashNote>
        Recreation on synthetic data · {readinessRows.length} of the original&rsquo;s {READINESS_TOTAL} records · the verdict rule is reproduced exactly
      </DashNote>
    </>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-bold tabular-nums">
      {n}
    </span>
  );
}
