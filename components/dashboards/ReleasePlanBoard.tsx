'use client';
/**
 * Recreation of the programme release-plan portal.
 *
 * ── Four pages, because the plan alone was not the problem ────────────────
 * The original is a portal rather than a dashboard: one page holds the
 * month's deliverables, and three more hold the delivery hierarchy, the
 * lifecycle and the sprint ceremonies the plan assumes. That pairing is the
 * point. A release plan that three functions read differently is usually a
 * plan whose stage names mean different things to each of them, and the fix
 * was to publish the process next to the plan rather than in a separate
 * document nobody opens. The rail is therefore wired to real pages here; a
 * recreation that showed only the table would be showing the half that
 * already existed before this was built.
 *
 * ── Counts come from the rows, the project chips do not ───────────────────
 * The stat tiles and every chip count are derived. `RELEASE_TOTAL` is the
 * original's real deliverable count for the month and is printed only in the
 * footer, next to a statement that this table is a subset, the two numbers
 * are never mixed, because a tile reading 49 above a table of 18 is the exact
 * kind of quiet contradiction this whole page exists to avoid.
 */
import { useMemo, useState } from 'react';
import {
  agileCycle,
  definitionOfDone,
  definitionOfReady,
  deliveryHierarchy,
  lifecycleContrast,
  lifecycleStages,
  releaseMonth,
  releaseRows,
  RELEASE_TOTAL,
  type Priority,
  type ReleaseRow,
  type ReleaseStage,
} from '@/content/dashboards-demo';
import { AvatarChip, FilterBar, Panel, StatTile, Th } from './primitives';
import { DashNote, RailShell, type RailItem } from './shell';

const STAGE_COLOR: Record<ReleaseStage, string> = {
  Live: 'bg-emerald-50 text-emerald-700',
  UAT: 'bg-sky-50 text-sky-700',
  Development: 'bg-indigo-50 text-indigo-700',
  Design: 'bg-rose-50 text-rose-700',
  'To Be Picked': 'bg-slate-100 text-slate-600',
  Deferred: 'bg-amber-50 text-amber-700',
};

const STAGE_DOT: Record<ReleaseStage, string> = {
  Live: 'bg-emerald-500',
  UAT: 'bg-sky-500',
  Development: 'bg-indigo-500',
  Design: 'bg-rose-500',
  'To Be Picked': 'bg-slate-400',
  Deferred: 'bg-amber-500',
};

const PRIORITY_COLOR: Record<Priority, string> = {
  P0: 'bg-red-50 text-red-700',
  P1: 'bg-amber-50 text-amber-700',
  P2: 'bg-slate-100 text-slate-600',
};

const STAGES = Object.keys(STAGE_COLOR) as ReleaseStage[];

const PAGES: RailItem[] = [
  { id: 'plan', label: 'Dashboard', heading: 'Overview' },
  { id: 'hierarchy', label: 'Product process', heading: 'Process' },
  { id: 'lifecycle', label: 'Lifecycle 2.0' },
  { id: 'agile', label: 'Agile methodology' },
];

type SortKey = 'n' | 'feature' | 'priority' | 'stage' | 'goLive';

const inStage = (s: ReleaseStage) =>
  releaseRows.filter((r) => r.stage === s).length;

/* ─────────────────────────────── the plan ──────────────────────────────── */

function PlanPage() {
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('All projects');
  const [stage, setStage] = useState('All stages');
  const [priority, setPriority] = useState('All priorities');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'n',
    dir: 'asc',
  });

  const projects = useMemo(() => {
    const tally = new Map<string, number>();
    for (const r of releaseRows)
      tally.set(r.project, (tally.get(r.project) ?? 0) + 1);
    return [...tally].sort((a, b) => b[1] - a[1]);
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = releaseRows.filter((r) => {
      if (project !== 'All projects' && r.project !== project) return false;
      if (stage !== 'All stages' && r.stage !== stage) return false;
      if (priority !== 'All priorities' && r.priority !== priority) return false;
      if (!q) return true;
      return `${r.feature} ${r.pm.name} ${r.em.name} ${r.workType}`
        .toLowerCase()
        .includes(q);
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === 'n') return (a.n - b.n) * dir;
      return String(a[sort.key]).localeCompare(String(b[sort.key])) * dir;
    });
  }, [query, project, stage, priority, sort]);

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

  const total = releaseRows.length;
  const p0 = releaseRows.filter((r) => r.priority === 'P0').length;
  const inFlight = releaseRows.filter((r) =>
    ['Development', 'UAT', 'Design'].includes(r.stage),
  ).length;

  return (
    <>
      <header className="mb-5">
        <h3 className="text-2xl font-bold tracking-tight text-[#111827]">
          Programme release plan
        </h3>
        <p className="mt-1 text-sm text-[#6b7280]">
          Resource planning, prioritisation and collaboration across product, engineering and security, {releaseMonth}.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Deliverables" value={total} note={`${releaseMonth} plan`} tone="indigo" />
        <StatTile label="Shipped / live" value={inStage('Live')} note={`${Math.round((inStage('Live') / total) * 100)}% of plan complete`} tone="green" />
        <StatTile label="In flight" value={inFlight} note="Dev · UAT · Design" tone="amber" />
        <StatTile label="P0 critical" value={p0} note="Highest priority" tone="red" />
        <StatTile label="To be picked" value={inStage('To Be Picked')} note="Backlog / planning" tone="slate" />
        <StatTile label="Deferred / on hold" value={inStage('Deferred')} note="Needs review" tone="violet" />
      </div>

      <Panel className="mb-5" title="Projects in the plan">
        <ul className="flex flex-wrap gap-2">
          <li>
            <button
              type="button"
              onClick={() => setProject('All projects')}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${project === 'All projects' ? 'bg-indigo-600 text-white' : 'bg-[#f3f4f6] text-[#4b5563] hover:bg-[#e9ebf2]'}`}
            >
              All projects <span className="ml-1 tabular-nums opacity-70">{total}</span>
            </button>
          </li>
          {projects.map(([name, n]) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => setProject(name)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${project === name ? 'bg-indigo-600 text-white' : 'bg-[#f3f4f6] text-[#4b5563] hover:bg-[#e9ebf2]'}`}
              >
                {name} <span className="ml-1 tabular-nums opacity-70">{n}</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <FilterBar
          query={query}
          onQuery={setQuery}
          placeholder="Search features, owners..."
          selects={[
            { value: stage, onChange: setStage, options: ['All stages', ...STAGES] },
            { value: priority, onChange: setPriority, options: ['All priorities', 'P0', 'P1', 'P2'] },
          ]}
          count={
            <>
              <strong className="font-semibold text-[#111827]">{rows.length}</strong> of {total} deliverables
            </>
          }
        />
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-225 border-collapse">
            <thead>
              <tr className="border-b border-[#eef1f7]">
                <Th label="#" {...sortProps('n')} className="w-12" />
                <Th label="Feature" {...sortProps('feature')} />
                <Th label="Priority" {...sortProps('priority')} />
                <Th label="Work type" />
                <Th label="Stage" {...sortProps('stage')} />
                <Th label="PM" />
                <Th label="EM" />
                <Th label="Go-live" {...sortProps('goLive')} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r: ReleaseRow) => (
                <tr key={r.n} className="border-b border-[#f3f4f6] hover:bg-[#fafbfd]">
                  <td className="px-3 py-3.5 text-sm tabular-nums text-[#9ca3af]">{r.n}</td>
                  <td className="px-3 py-3.5 text-sm font-semibold text-[#111827]">{r.feature}</td>
                  <td className="px-3 py-3.5">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${PRIORITY_COLOR[r.priority]}`}>{r.priority}</span>
                  </td>
                  <td className="px-3 py-3.5 text-sm text-[#4b5563]">{r.workType}</td>
                  <td className="px-3 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STAGE_COLOR[r.stage]}`}>
                      <span className={`size-1.5 rounded-full ${STAGE_DOT[r.stage]}`} />
                      {r.stage}
                    </span>
                  </td>
                  <td className="px-3 py-3.5"><AvatarChip person={r.pm} /></td>
                  <td className="px-3 py-3.5 text-sm text-[#9ca3af]">{r.em.name}</td>
                  <td className="px-3 py-3.5 text-sm font-semibold text-[#111827]">{r.goLive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#9ca3af]">No deliverables match those filters.</p>
        ) : null}
      </Panel>
    </>
  );
}

/* ───────────────────────────── process pages ───────────────────────────── */

const LEVEL_BG = [
  'from-indigo-500 to-indigo-600',
  'from-violet-500 to-violet-600',
  'from-blue-500 to-blue-600',
  'from-teal-500 to-teal-600',
  'from-emerald-500 to-emerald-600',
];

function HierarchyPage() {
  return (
    <>
      <header className="mb-5">
        <h3 className="text-2xl font-bold tracking-tight text-[#111827]">Product process</h3>
        <p className="mt-1 text-sm text-[#6b7280]">
          From organisation OKRs to shipped deliverables, the hierarchy and artifacts that guide the work.
        </p>
      </header>
      <Panel title="Delivery hierarchy" className="mb-5">
        <p className="mb-4 -mt-2 text-sm text-[#6b7280]">Each level rolls up into the one above it.</p>
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {deliveryHierarchy.map((l, i) => (
            <li key={l.name} className={`rounded-xl bg-gradient-to-br p-4 text-white ${LEVEL_BG[i]}`}>
              <p className="text-[10px] font-semibold tracking-[.1em] uppercase opacity-80">Level {l.level}</p>
              <p className="mt-1 text-lg font-bold">{l.name}</p>
            </li>
          ))}
        </ol>
      </Panel>
      <Panel title="Documents used in this process">
        <p className="mb-4 -mt-2 text-sm text-[#6b7280]">The standard artifact created at each stage.</p>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {deliveryHierarchy.map((l) => (
            <li key={l.artifact} className="rounded-xl border border-[#e5e7eb] p-4">
              <p className="text-[11px] font-semibold tracking-[.08em] text-[#9ca3af] uppercase">Level {l.level}</p>
              <p className="mt-1 text-sm font-semibold text-[#111827]">{l.artifact}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

function LifecyclePage() {
  return (
    <>
      <header className="mb-5">
        <h3 className="text-2xl font-bold tracking-tight text-[#111827]">Lifecycle 2.0</h3>
        <p className="mt-1 text-sm text-[#6b7280]">
          An AI-assisted product development lifecycle that combines human judgement with AI acceleration.
        </p>
      </header>
      <Panel title="Lifecycle flow" className="mb-5">
        <p className="mb-4 -mt-2 text-sm text-[#6b7280]">
          From problem to released value, {lifecycleStages.length} connected stages.
        </p>
        <ol className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {lifecycleStages.map((s, i) => (
            <li key={s} className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] px-3 py-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-indigo-600 text-xs font-bold text-white tabular-nums">{i + 1}</span>
              <span className="text-sm font-medium text-[#111827]">{s}</span>
            </li>
          ))}
        </ol>
      </Panel>
      <Panel title="Traditional lifecycle vs 2.0">
        <p className="mb-4 -mt-2 text-sm text-[#6b7280]">What changes when AI augments the lifecycle.</p>
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-150 border-collapse">
            <thead>
              <tr className="border-b border-[#eef1f7]">
                <Th label="Aspect" />
                <Th label="Traditional" />
                <Th label="Lifecycle 2.0" />
              </tr>
            </thead>
            <tbody>
              {lifecycleContrast.map((c) => (
                <tr key={c.aspect} className="border-b border-[#f3f4f6]">
                  <td className="px-3 py-3.5 text-sm font-semibold text-[#111827]">{c.aspect}</td>
                  <td className="px-3 py-3.5 text-sm text-[#6b7280]">{c.before}</td>
                  <td className="px-3 py-3.5 text-sm font-medium text-emerald-700">✓ {c.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function AgilePage() {
  return (
    <>
      <header className="mb-5">
        <h3 className="text-2xl font-bold tracking-tight text-[#111827]">Agile methodology</h3>
        <p className="mt-1 text-sm text-[#6b7280]">
          Two-week sprints with active business participation in reviews and UAT.
        </p>
      </header>
      <Panel title="Agile cycle" className="mb-5">
        <p className="mb-4 -mt-2 text-sm text-[#6b7280]">The ceremonies that flow through every two-week sprint, and repeat.</p>
        <ol className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {agileCycle.map((s, i) => (
            <li key={s} className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] px-3 py-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sky-600 text-xs font-bold text-white tabular-nums">{i + 1}</span>
              <span className="text-sm font-medium text-[#111827]">{s}</span>
            </li>
          ))}
        </ol>
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Definition of ready">
          <ul className="space-y-2.5">
            {definitionOfReady.map((d) => (
              <li key={d} className="flex gap-2.5 border-b border-[#f3f4f6] pb-2.5 text-sm text-[#374151] last:border-0">
                <span className="text-amber-500">▸</span>
                {d}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Definition of done">
          <ul className="space-y-2.5">
            {definitionOfDone.map((d) => (
              <li key={d} className="flex gap-2.5 border-b border-[#f3f4f6] pb-2.5 text-sm text-[#374151] last:border-0">
                <span className="text-emerald-500">✓</span>
                {d}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

/* ──────────────────────────────── shell ────────────────────────────────── */

export function ReleasePlanBoard() {
  const [page, setPage] = useState('plan');

  return (
    <>
      <RailShell
        tone="light"
        brand={
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
              PV
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[#111827]">Product visibility</span>
              <span className="block text-xs text-[#6b7280]">Programme management</span>
            </span>
          </div>
        }
        items={PAGES}
        active={page}
        onSelect={setPage}
        footer={<>Dashboard generated from the live release-plan sheet.</>}
      >
        {page === 'plan' ? <PlanPage /> : null}
        {page === 'hierarchy' ? <HierarchyPage /> : null}
        {page === 'lifecycle' ? <LifecyclePage /> : null}
        {page === 'agile' ? <AgilePage /> : null}
      </RailShell>
      <DashNote>
        Recreation on synthetic data · {releaseRows.length} of the original&rsquo;s {RELEASE_TOTAL} {releaseMonth} deliverables, enough to exercise every filter
      </DashNote>
    </>
  );
}
