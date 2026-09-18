'use client';
/**
 * Recreation of the payroll rollout action-plan dashboard.
 *
 * ── The banners are the dashboard, not decoration ─────────────────────────
 * Two thirds of this screen is a table, and the part business users actually
 * read is the pair of banners above it: which phase the rollout has reached,
 * and whether the user guide has gone out. Those were the questions being
 * asked in the status meeting, so they are stated in words at the top rather
 * than left to be inferred from sixteen rows of task status. A recreation
 * that kept the table and dropped the banners would look like the original
 * and answer none of what it was built to answer.
 *
 * ── Estimate against actual, on every row ─────────────────────────────────
 * The table carries tentative and actual dates side by side because the
 * interesting fact is the gap: the requirement document was estimated at two
 * days and took eight, and the row says so without anyone computing it.
 * `slipped` derives that comparison rather than storing it, so it cannot fall
 * out of step with the dates beside it.
 */
import { useMemo, useState } from 'react';
import {
  actionPlanCurrentPhase,
  actionPlanLiveDate,
  actionPlanMembers,
  actionPlanPhases,
  actionPlanRows,
  type TaskRow,
  type TaskStatus,
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
  Th,
  type Tone,
} from './primitives';
import { DashNote } from './shell';

const STATUSES: { status: TaskStatus; tone: Tone }[] = [
  { status: 'Completed', tone: 'green' },
  { status: 'In Progress', tone: 'amber' },
  { status: 'To be picked up', tone: 'slate' },
];

const TONE: Record<TaskStatus, Tone> = {
  Completed: 'green',
  'In Progress': 'amber',
  'To be picked up': 'slate',
};

type SortKey = 'sr' | 'task' | 'hrs' | 'owner' | 'status';

const count = (status: TaskStatus) =>
  actionPlanRows.filter((r) => r.status === status).length;

/** True when a task finished later than its tentative end date. */
function slipped(r: TaskRow) {
  return r.actual?.[1] != null && r.actual[1] !== r.tentative[1];
}

function Dates({ range }: { range: [string, string | null] }) {
  return (
    <>
      <span className="block">{range[0]}</span>
      <span className="block">
        <span className="text-[#9ca3af]">→ </span>
        {range[1] ?? <span className="text-[#9ca3af] italic">running</span>}
      </span>
    </>
  );
}

export function ActionPlanBoard() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All statuses');
  const [owner, setOwner] = useState('All owners');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'sr',
    dir: 'asc',
  });

  const owners = useMemo(() => {
    const tally = new Map<string, number>();
    for (const r of actionPlanRows)
      tally.set(r.owner.name, (tally.get(r.owner.name) ?? 0) + 1);
    return [...tally].sort((a, b) => b[1] - a[1]);
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = actionPlanRows.filter((r) => {
      if (status !== 'All statuses' && r.status !== status) return false;
      if (owner !== 'All owners' && r.owner.name !== owner) return false;
      if (!q) return true;
      return `${r.sr} ${r.task} ${r.owner.name}`.toLowerCase().includes(q);
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === 'hrs') return (a.hrs - b.hrs) * dir;
      if (sort.key === 'sr')
        return (
          a.sr.localeCompare(b.sr, undefined, { numeric: true }) * dir
        );
      const av = sort.key === 'owner' ? a.owner.name : a[sort.key];
      const bv = sort.key === 'owner' ? b.owner.name : b[sort.key];
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [query, status, owner, sort]);

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

  const total = actionPlanRows.length;
  const done = count('Completed');
  const effort = actionPlanRows.reduce((n, r) => n + r.hrs, 0);
  const phase = actionPlanPhases[actionPlanCurrentPhase];

  return (
    <DashFrame>
      <DashHeader
        title="Payroll Enhancement, Action Plan"
        subtitle="One rollout, tracked from requirements to hypercare · auto-refreshes every 30s"
        badge={<LivePill time="09:58:52" />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Total tasks" value={total} note="Action plan items" tone="indigo" />
        <StatTile label="Completed" value={done} note={`${Math.round((done / total) * 100)}% done`} tone="green" />
        <StatTile label="In progress" value={count('In Progress')} note="Being worked now" tone="amber" />
        <StatTile label="To be picked up" value={count('To be picked up')} note="Pending start" tone="violet" />
        <StatTile label="Total effort" value={`${effort} hrs`} note="Across all tasks" tone="blue" emphasise />
        <StatTile label="Project live date" value={actionPlanLiveDate} note="Planned production release" tone="red" emphasise />
      </div>

      <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-[11px] font-semibold tracking-[.1em] text-amber-700 uppercase">
          Current phase
        </p>
        <h4 className="mt-1 text-xl font-bold text-amber-900">{phase}</h4>
        <p className="mt-1 text-sm text-amber-800">
          Build is on UAT and both business teams are testing. Production deployment is scheduled for {actionPlanLiveDate}.
        </p>
      </section>

      <ol className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {actionPlanPhases.map((p, i) => {
          const state = i < actionPlanCurrentPhase ? 'done' : i === actionPlanCurrentPhase ? 'now' : 'next';
          return (
            <li
              key={p}
              className={`flex items-center gap-3 rounded-xl border p-4 ${
                state === 'done'
                  ? 'border-emerald-200 bg-white'
                  : state === 'now'
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-[#e5e7eb] bg-white'
              }`}
            >
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  state === 'done'
                    ? 'bg-emerald-500 text-white'
                    : state === 'now'
                      ? 'bg-amber-500 text-white'
                      : 'bg-[#e5e7eb] text-[#6b7280]'
                }`}
              >
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#111827]">{p}</span>
                <span className="block text-[11px] font-semibold tracking-[.08em] text-[#9ca3af] uppercase">
                  {state === 'done' ? 'Completed' : state === 'now' ? 'In progress' : 'Not started'}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <section className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <p className="text-[11px] font-semibold tracking-[.1em] text-blue-700 uppercase">
          User guide shared
        </p>
        <h4 className="mt-1 text-lg font-bold text-blue-900">Phase 1 user guide</h4>
        <p className="mt-1 text-sm text-blue-900/80">
          Sent by email to every business user for reference ahead of the production release.
        </p>
        <p className="mt-2 text-xs font-medium text-blue-800">
          Shared on 22 May 2026 · HR team, Finance team and business users
        </p>
      </section>

      <Panel title="Active members on UAT" right={<span className="text-sm text-[#6b7280]">{actionPlanMembers.length} team members</span>} className="mb-5">
        <ul className="flex flex-wrap gap-3">
          {actionPlanMembers.map((m) => (
            <li
              key={m.person.name}
              className={`flex items-center gap-3 rounded-full border py-1.5 pr-4 pl-1.5 ${m.owner ? 'border-amber-300 bg-amber-50' : 'border-[#e5e7eb] bg-white'}`}
            >
              <span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${m.person.tone}`}>
                {m.person.initials}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#111827]">{m.person.name}</span>
                <span className="block text-xs text-[#6b7280]">{m.role}</span>
              </span>
              <span className="ml-2 shrink-0 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-xs font-semibold text-[#4b5563] tabular-nums">
                {m.hrs} hrs
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Status breakdown">
          {STATUSES.map((s) => (
            <BarRow key={s.status} label={s.status} value={count(s.status)} max={total} tone={s.tone} />
          ))}
        </Panel>
        <Panel title="Tasks by owner">
          {owners.map(([name, n]) => (
            <BarRow key={name} label={name} value={n} max={owners[0][1]} gradient />
          ))}
        </Panel>
      </div>

      <Panel>
        <FilterBar
          query={query}
          onQuery={setQuery}
          placeholder="Search by Sr. No, task, owner..."
          selects={[
            { value: status, onChange: setStatus, options: ['All statuses', ...STATUSES.map((s) => s.status)] },
            { value: owner, onChange: setOwner, options: ['All owners', ...owners.map(([n]) => n)] },
          ]}
          count={
            <>
              <strong className="font-semibold text-[#111827]">{rows.length}</strong> of {total} tasks
            </>
          }
        />
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-225 border-collapse">
            <thead>
              <tr className="border-b border-[#eef1f7]">
                <Th label="Sr" {...sortProps('sr')} className="w-16" />
                <Th label="Task" {...sortProps('task')} />
                <Th label="Hrs" {...sortProps('hrs')} className="w-16" />
                <Th label="Tentative dates" />
                <Th label="Owner" {...sortProps('owner')} />
                <Th label="Actual dates" />
                <Th label="Status" {...sortProps('status')} />
                <Th label="Comments" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.sr}
                  className={`border-b border-[#f3f4f6] align-top ${r.status === 'Completed' ? 'bg-emerald-50/40' : ''} hover:bg-[#fafbfd]`}
                >
                  <td className={`px-3 py-3 text-sm font-semibold tabular-nums ${r.sr.includes('.') ? 'pl-6 text-[#9ca3af]' : 'text-indigo-600'}`}>{r.sr}</td>
                  <td className="px-3 py-3 text-sm text-[#111827]">{r.task}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-[#374151]">{r.hrs}</td>
                  <td className="px-3 py-3 text-xs font-medium text-[#374151]"><Dates range={r.tentative} /></td>
                  <td className="px-3 py-3"><AvatarChip person={r.owner} /></td>
                  <td className={`px-3 py-3 text-xs font-medium ${slipped(r) ? 'text-amber-700' : 'text-[#374151]'}`}>
                    {r.actual ? <Dates range={r.actual} /> : <span className="text-[#d1d5db]">, </span>}
                  </td>
                  <td className="px-3 py-3"><StatusPill label={r.status.toUpperCase()} tone={TONE[r.status]} /></td>
                  <td className="px-3 py-3 text-sm text-[#6b7280]">{r.comment ?? <span className="text-[#d1d5db]">, </span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#9ca3af]">No tasks match those filters.</p>
        ) : null}
      </Panel>

      <DashNote>
        Recreation on synthetic data · {total} tasks · {effort} hrs planned · the original auto-refreshes every 30s
      </DashNote>
    </DashFrame>
  );
}
