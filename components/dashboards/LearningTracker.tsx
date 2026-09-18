'use client';
/**
 * Recreation of the capability and learning tracker.
 *
 * ── Attendance is reported, and deliberately not scored ───────────────────
 * The rating is the mean of a functional and a technical assessment, and
 * attendance sits beside it as context rather than inside it as a term. That
 * separation is the judgement this dashboard encodes: someone who attended
 * everything and cannot build is not ready, and someone who missed four
 * sessions and ships is. Folding attendance into the score would have made
 * the number easier to compute and would have answered a different question
 * from the one it was built for, who can be given work on this now.
 *
 * ── The lowest rating is on the same rail as the highest ──────────────────
 * The person rated 4.5 appears in the list, in rank order, with the reason
 * written out. A tracker that quietly sorted poor performers off the bottom
 * would have been more comfortable and would have removed the only case the
 * dashboard existed to catch.
 */
import { useState } from 'react';
import { learners } from '@/content/dashboards-demo';
import { Ring, share, StackedBar } from './charts';
import {
  DarkPanel,
  DarkPill,
  DarkStat,
  DashNote,
  RailShell,
  type RailItem,
} from './shell';

function ratingColor(r: number) {
  if (r >= 8) return '#22c55e';
  if (r >= 6.5) return '#a3cc3a';
  if (r >= 5) return '#eab308';
  return '#ef4444';
}

export function LearningTracker() {
  const ranked = [...learners].sort((a, b) => b.rating - a.rating);
  const [active, setActive] = useState(ranked[0].person.name);
  const l = ranked.find((x) => x.person.name === active) ?? ranked[0];

  const items: RailItem[] = ranked.map((x, i) => ({
    id: x.person.name,
    label: x.person.name,
    heading: i === 0 ? `Members · ${ranked.length}` : undefined,
    badge: (
      <span
        className="rounded-full px-2 py-0.5 text-[11px] font-bold text-[#0f131e] tabular-nums"
        style={{ background: ratingColor(x.rating) }}
      >
        {x.rating.toFixed(1)}
      </span>
    ),
  }));

  const attendance = (l.sessions.attended / l.sessions.total) * 100;
  const completion = (l.assignments.done / l.assignments.total) * 100;
  const missed = l.sessions.total - l.sessions.attended;

  const performance = [
    { label: 'Effort hrs', value: l.effortHrs, color: '#ef4444' },
    { label: 'Assignments', value: l.assignments.done, color: '#f59e0b' },
    { label: 'Functional', value: l.functional, color: '#3b82f6' },
    { label: 'Technical', value: l.technical, color: '#9ca3af' },
  ];

  return (
    <>
      <RailShell
        tone="dark"
        brand={
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold tracking-[.1em] text-[#8a93ad] uppercase">
              Programme members
            </p>
            <span className="rounded-full bg-[#232a3d] px-2 py-0.5 text-xs font-bold text-white tabular-nums">
              {ranked.length}
            </span>
          </div>
        }
        items={items}
        active={active}
        onSelect={setActive}
        footer={
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-400" />
            Live · 10:06:40
          </span>
        }
      >
        <header className="mb-5 flex flex-wrap items-center gap-3 border-l-4 border-indigo-500 pl-4">
          <h3 className="text-2xl font-bold tracking-tight text-white">
            {l.person.name}
          </h3>
          <DarkPill label={l.verdict.toUpperCase()} color={ratingColor(l.rating)} />
        </header>

        <div className="mb-5 grid gap-5 xl:grid-cols-2">
          <DarkPanel title="Overall rating">
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <Ring
                dark
                value={l.rating}
                max={10}
                color={ratingColor(l.rating)}
                caption={{ value: l.rating.toFixed(1), label: 'Out of 10' }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xl font-bold text-white">{l.verdict}</p>
                <p className="mt-1 text-sm text-[#8a93ad]">{l.verdictNote}</p>
                <dl className="mt-4 space-y-1.5 rounded-xl bg-[#1a2030] p-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#8a93ad]">Functional rating</dt>
                    <dd className="font-semibold text-white tabular-nums">{l.functional.toFixed(1)} / 10</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#8a93ad]">Technical rating</dt>
                    <dd className="font-semibold text-white tabular-nums">{l.technical.toFixed(1)} / 10</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-[#252a3a] pt-1.5">
                    <dt className="text-[#8a93ad]">Overall (mean)</dt>
                    <dd className="font-semibold text-white tabular-nums">
                      {((l.functional + l.technical) / 2).toFixed(1)} / 10
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </DarkPanel>

          <DarkPanel title="Sessions attendance">
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <Ring
                dark
                value={attendance}
                color={attendance >= 70 ? '#a3cc3a' : '#eab308'}
                caption={{ value: `${Math.round(attendance)}%`, label: 'Attended' }}
              />
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                <DarkStat label="Total sessions" value={l.sessions.total} tone="blue" />
                <DarkStat label="Attended" value={l.sessions.attended} tone="green" />
                <DarkStat label="Missed" value={missed} tone="red" />
                <DarkStat label="Effort hrs" value={l.effortHrs} tone="violet" />
              </div>
            </div>
          </DarkPanel>
        </div>

        <DarkPanel title="Executive summary" className="mb-5">
          <p className="mb-2 text-sm font-semibold text-[#c2c9db]">
            A. Assignment completion
          </p>
          <StackedBar
            dark
            height={30}
            segments={[
              { label: 'Completed', value: l.assignments.done, color: '#22c55e' },
              { label: 'Pending', value: l.assignments.total - l.assignments.done, color: '#ef4444' },
            ]}
          />
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
            <li className="flex items-center gap-2 text-[#c2c9db]">
              <span className="size-2.5 rounded-[3px] bg-emerald-500" />
              Completed <strong className="text-white tabular-nums">{l.assignments.done}</strong>
              <span className="text-[#6e778f]">({share(l.assignments.done, l.assignments.total)})</span>
            </li>
            <li className="flex items-center gap-2 text-[#c2c9db]">
              <span className="size-2.5 rounded-[3px] bg-red-500" />
              Pending{' '}
              <strong className="text-white tabular-nums">
                {l.assignments.total - l.assignments.done}
              </strong>
              <span className="text-[#6e778f]">
                ({share(l.assignments.total - l.assignments.done, l.assignments.total)})
              </span>
            </li>
          </ul>

          <p className="mt-6 mb-2 text-sm font-semibold text-[#c2c9db]">
            B. Performance breakdown
          </p>
          <StackedBar dark height={30} segments={performance} />
          <ul className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {performance.map((s) => (
              <li
                key={s.label}
                className="rounded-xl bg-[#1a2030] p-3"
                style={{ borderLeft: `3px solid ${s.color}` }}
              >
                <p className="text-[11px] font-semibold tracking-[.08em] text-[#8a93ad] uppercase">{s.label}</p>
                <p className="mt-0.5 text-2xl font-bold text-white tabular-nums">{s.value}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[#6e778f]">
            Assignment completion sits at {Math.round(completion)}%; attendance is reported beside the rating rather than folded into it.
          </p>
        </DarkPanel>

        <DarkPanel title="Additional comments">
          <ul className="space-y-1.5 text-sm text-[#c2c9db]">
            {l.comments.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-[#8a93ad]">
            Use case, <span className="text-white">{l.useCase}</span>
          </p>
        </DarkPanel>
      </RailShell>
      <DashNote>
        Recreation on synthetic data · {ranked.length} members · rating is the mean of the functional and technical assessments
      </DashNote>
    </>
  );
}
