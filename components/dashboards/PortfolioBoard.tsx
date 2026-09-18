'use client';
/**
 * Recreation of the internal automation delivery board.
 *
 * ── Interactive, not a picture of a dashboard ─────────────────────────────
 * Search, the two filters and column sorting all work. A screenshot would
 * have been a tenth of the effort and would show a visitor nothing about
 * whether the thing functions; the whole claim being made on this page is
 * "these were built", and a static image is evidence of a design, not of a
 * build.
 *
 * ── Every derived number is derived ───────────────────────────────────────
 * The stat tiles, the pipeline, both breakdowns and the row counter are all
 * computed from `portfolioRows`. Hard-coding "15" next to a table that filters
 * is how a showcase ends up contradicting itself in front of the one reader
 * who tries the controls.
 *
 * ── No clock ──────────────────────────────────────────────────────────────
 * The original carries a live timestamp and re-reads its sheet every 30s.
 * There is nothing behind this copy to re-read, and `Date.now()` in a
 * component body is exactly what `react/react-compiler` rejects in this repo.
 * The "Live" pill therefore shows a fixed time, which is honest: this is a
 * recreation, and a ticking clock would imply a data source that does not
 * exist.
 */
import { useMemo, useState } from 'react';
import {
  portfolioRows,
  type Department,
  type PortfolioRow,
  type ProjectStatus,
} from '@/content/dashboards-demo';
import {
  AvatarChip,
  BarRow,
  DashFrame,
  DashHeader,
  FilterBar,
  LivePill,
  Panel,
  StatTile,
  StatusPill,
  Tag,
  Th,
  type Tone,
} from './primitives';

const STAGES: { status: ProjectStatus; tone: Tone }[] = [
  { status: 'BRD Pending', tone: 'slate' },
  { status: 'In Development', tone: 'amber' },
  { status: 'UAT Testing', tone: 'blue' },
  { status: 'Live', tone: 'green' },
];

const TONE: Record<ProjectStatus, Tone> = {
  'BRD Pending': 'slate',
  'In Development': 'amber',
  'UAT Testing': 'blue',
  Live: 'green',
};

const DEPARTMENTS: Department[] = ['HR', 'Project', 'HR and Finance'];

type SortKey = 'sr' | 'project' | 'department' | 'start' | 'status';

function count(rows: PortfolioRow[], status: ProjectStatus) {
  return rows.filter((r) => r.status === status).length;
}

export function PortfolioBoard() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All statuses');
  const [dept, setDept] = useState('All departments');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'sr',
    dir: 'asc',
  });

  const owners = useMemo(() => {
    const tally = new Map<string, number>();
    for (const r of portfolioRows)
      tally.set(r.owner.name, (tally.get(r.owner.name) ?? 0) + 1);
    return [...tally].sort((a, b) => b[1] - a[1]);
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = portfolioRows.filter((r) => {
      if (status !== 'All statuses' && r.status !== status) return false;
      if (dept !== 'All departments' && r.department !== dept) return false;
      if (!q) return true;
      const haystack = [
        r.project,
        r.owner.name,
        ...r.dev.map((p) => p.name),
        ...r.qa.map((p) => p.name),
        ...r.business.map((p) => p.name),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === 'sr') return (a.sr - b.sr) * dir;
      const av = String(
        sort.key === 'start' ? (a.start ?? 'zzz') : a[sort.key],
      );
      const bv = String(
        sort.key === 'start' ? (b.start ?? 'zzz') : b[sort.key],
      );
      return av.localeCompare(bv) * dir;
    });
  }, [query, status, dept, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
  const sortProps = (key: SortKey) => ({
    active: sort.key === key,
    dir: sort.dir,
    onSort: () => toggle(key),
  });

  const total = portfolioRows.length;
  const live = count(portfolioRows, 'Live');

  return (
    <DashFrame>
      <DashHeader
        title="Internal Automation, Project Portfolio"
        subtitle="Live status across all internal automation initiatives · HR, Finance & Projects · auto-refreshes every 30s"
        badge={<LivePill time="09:58:09" />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Total projects" value={total} note="In the portfolio" tone="indigo" />
        <StatTile label="Live" value={live} note={`${Math.round((live / total) * 100)}% shipped`} tone="green" />
        <StatTile label="In development" value={count(portfolioRows, 'In Development')} note="Being built now" tone="amber" />
        <StatTile label="UAT testing" value={count(portfolioRows, 'UAT Testing')} note="Awaiting sign-off" tone="blue" />
        <StatTile label="BRD pending" value={count(portfolioRows, 'BRD Pending')} note="Awaiting requirements" tone="violet" />
        <StatTile label="Departments" value={DEPARTMENTS.length} note={DEPARTMENTS.join(' · ')} tone="indigo" />
      </div>

      <Panel title="Delivery pipeline" className="mb-5">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {STAGES.map(({ status: s, tone }, i) => {
            const n = count(portfolioRows, s);
            return (
              <div key={s} className={i > 0 ? 'xl:border-l xl:border-[#eef1f7] xl:pl-5' : ''}>
                <p className="flex items-center gap-2 text-sm font-medium text-[#374151]">
                  <span className={`size-2.5 rounded-full ${tone === 'slate' ? 'bg-slate-400' : tone === 'amber' ? 'bg-amber-500' : tone === 'blue' ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                  {s}
                </p>
                <p className={`mt-2 text-3xl font-bold tabular-nums ${tone === 'slate' ? 'text-[#111827]' : tone === 'amber' ? 'text-amber-600' : tone === 'blue' ? 'text-blue-600' : 'text-emerald-600'}`}>
                  {n}
                </p>
                <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-[#eef1f7]">
                  <span className={`block h-full rounded-full ${tone === 'slate' ? 'bg-slate-400' : tone === 'amber' ? 'bg-amber-500' : tone === 'blue' ? 'bg-blue-500' : 'bg-emerald-500'}`} style={{ width: `${(n / total) * 100}%` }} />
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Status breakdown">
          {STAGES.filter((s) => count(portfolioRows, s.status) > 0).map((s) => (
            <BarRow key={s.status} label={s.status} value={count(portfolioRows, s.status)} max={total} tone={s.tone} />
          ))}
        </Panel>
        <Panel title="Projects by department">
          {DEPARTMENTS.map((d) => (
            <BarRow key={d} label={d} value={portfolioRows.filter((r) => r.department === d).length} max={total} tone="indigo" />
          ))}
        </Panel>
      </div>

      <Panel title="Project owner workload" className="mb-5">
        {owners.map(([name, n]) => (
          <BarRow key={name} label={name} value={n} max={owners[0][1]} gradient />
        ))}
      </Panel>

      <Panel>
        <FilterBar
          query={query}
          onQuery={setQuery}
          placeholder="Search project, owner, resource..."
          selects={[
            { value: status, onChange: setStatus, options: ['All statuses', ...STAGES.map((s) => s.status)] },
            { value: dept, onChange: setDept, options: ['All departments', ...DEPARTMENTS] },
          ]}
          count={
            <>
              <strong className="font-semibold text-[#111827]">{rows.length}</strong> of {total} projects
            </>
          }
        />
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-250 border-collapse">
            <thead>
              <tr className="border-b border-[#eef1f7]">
                <Th label="Sr" {...sortProps('sr')} className="w-14" />
                <Th label="Project" {...sortProps('project')} />
                <Th label="Department" {...sortProps('department')} />
                <Th label="Timeline" {...sortProps('start')} />
                <Th label="Status" {...sortProps('status')} />
                <Th label="Owner" />
                <Th label="Resources" />
                <Th label="Comments" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sr} className="border-b border-[#f3f4f6] align-top hover:bg-[#fafbfd]">
                  <td className="px-3 py-4 text-sm tabular-nums text-[#6b7280]">{r.sr}</td>
                  <td className="px-3 py-4 text-sm font-semibold text-[#111827]">{r.project}</td>
                  <td className="px-3 py-4"><Tag label={r.department} /></td>
                  <td className="px-3 py-4 text-sm">
                    {r.start ? (
                      <>
                        <span className="font-semibold text-[#111827]">{r.start}</span>
                        <span className="text-[#9ca3af]"> → </span>
                        <span className="font-semibold text-[#111827]">{r.end}</span>
                        <span className="mt-1 block text-xs text-[#9ca3af]">{r.days} days</span>
                      </>
                    ) : (
                      <span className="text-[#9ca3af] italic">To be decided</span>
                    )}
                  </td>
                  <td className="px-3 py-4"><StatusPill label={r.status.toUpperCase()} tone={TONE[r.status]} /></td>
                  <td className="px-3 py-4"><AvatarChip person={r.owner} boxed /></td>
                  <td className="px-3 py-4">
                    {([['Dev', r.dev], ['QA', r.qa], ['Business', r.business]] as const).map(([label, people]) => (
                      <div key={label} className="mb-2 last:mb-0">
                        <p className="text-[10px] font-semibold tracking-[.08em] text-[#9ca3af] uppercase">{label}</p>
                        {people.length ? (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {people.map((p) => <AvatarChip key={p.name} person={p} />)}
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-[#d1d5db]">, </p>
                        )}
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-4 text-sm text-[#6b7280]">{r.comment ?? <span className="text-[#d1d5db]">, </span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#9ca3af]">No projects match those filters.</p>
        ) : null}
      </Panel>

      <p className="mt-5 text-center text-xs text-[#9ca3af]">
        Recreation on synthetic data · {total} projects · the original auto-refreshes every 30s
      </p>
    </DashFrame>
  );
}
