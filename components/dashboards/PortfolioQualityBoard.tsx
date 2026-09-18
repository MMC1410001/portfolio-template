'use client';
/**
 * Recreation of the delivery-wide quality dashboard.
 *
 * ── The rail is the dashboard ─────────────────────────────────────────────
 * Every panel on the right also exists inside the per-engagement reports. The
 * thing that did not exist anywhere before this was the left rail: every
 * engagement, its current score, sorted so the one about to ship something
 * unsafe is visible without opening anything. Read that way the detail panels
 * are the drill-down and the list is the product, which is the opposite of
 * how it looks. A recreation that dropped the rail to save width would be
 * keeping the part that was already available.
 *
 * ── One weighting, applied to everyone ────────────────────────────────────
 * The score is test pass × 0.85 + performance × 0.10 + accessibility × 0.05,
 * and `weighted` computes it here rather than reading a stored number. That
 * is the whole reason the dashboard settles arguments: every engagement is
 * scored by the same formula, and the formula is printed on screen next to
 * its result so a reader can check the arithmetic rather than trust it.
 */
import { useState } from 'react';
import {
  qualityEngagements,
  type QualityEngagement,
} from '@/content/dashboards-demo';
import { Donut, Legend, Ring, SEVERITY_COLOR, share, StackedBar } from './charts';
import {
  DarkPanel,
  DarkPill,
  DarkStat,
  DashNote,
  RailShell,
  type RailItem,
} from './shell';

const WEIGHTS = { testPass: 0.85, performance: 0.1, accessibility: 0.05 };

/** The published formula, applied. Out of 100, then shown out of 10. */
function weighted(e: QualityEngagement) {
  return (
    e.weights.testPass * WEIGHTS.testPass +
    e.weights.performance * WEIGHTS.performance +
    e.weights.accessibility * WEIGHTS.accessibility
  );
}

function scoreColor(outOfTen: number) {
  if (outOfTen >= 9) return '#22c55e';
  if (outOfTen >= 7.5) return '#a3cc3a';
  if (outOfTen >= 5) return '#eab308';
  return '#ef4444';
}

export function PortfolioQualityBoard() {
  const [active, setActive] = useState(qualityEngagements[0].id);
  const e = qualityEngagements.find((q) => q.id === active) ?? qualityEngagements[0];

  const items: RailItem[] = qualityEngagements.map((q, i) => ({
    id: q.id,
    label: q.name,
    heading:
      i === 0
        ? 'Engagements'
        : q.group === 'group' && qualityEngagements[i - 1].group !== 'group'
          ? 'Group accounts'
          : undefined,
    badge: (
      <span
        className="rounded-full px-2 py-0.5 text-[11px] font-bold text-[#0f131e] tabular-nums"
        style={{ background: scoreColor(q.score) }}
      >
        {q.score.toFixed(1)}
      </span>
    ),
  }));

  const t = e.tests;
  const passRate = (t.passed / t.total) * 100;
  const testSegments = [
    { label: 'Passed', value: t.passed, color: '#22c55e' },
    { label: 'Failed', value: t.failed, color: '#ef4444' },
    { label: 'Blocked', value: t.blocked, color: '#9ca3af' },
    { label: 'Not run', value: t.notRun, color: '#eab308' },
  ].filter((s) => s.value > 0);

  const defectTotal =
    e.defects.critical + e.defects.high + e.defects.medium + e.defects.low;
  const defectSegments = [
    { label: 'Critical', value: e.defects.critical, color: SEVERITY_COLOR.Critical },
    { label: 'High', value: e.defects.high, color: SEVERITY_COLOR.High },
    { label: 'Medium', value: e.defects.medium, color: SEVERITY_COLOR.Medium },
    { label: 'Low', value: e.defects.low, color: SEVERITY_COLOR.Low },
  ];

  return (
    <>
      <RailShell
        tone="dark"
        brand={
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold tracking-[.1em] text-[#8a93ad] uppercase">
              All engagements
            </p>
            <span className="rounded-full bg-[#232a3d] px-2 py-0.5 text-xs font-bold text-white tabular-nums">
              {qualityEngagements.length}
            </span>
          </div>
        }
        items={items}
        active={active}
        onSelect={setActive}
        footer={
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-400" />
            Live · 10:03:32
          </span>
        }
      >
        <header className="mb-5 flex flex-wrap items-center gap-3 border-l-4 border-indigo-500 pl-4">
          <h3 className="text-2xl font-bold tracking-tight text-white">{e.name}</h3>
          <DarkPill
            label={e.verdict.toUpperCase()}
            color={scoreColor(e.score)}
          />
        </header>

        <div className="mb-5 grid gap-5 xl:grid-cols-2">
          <DarkPanel title="Quality score">
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <Ring
                dark
                value={e.score}
                max={10}
                color={scoreColor(e.score)}
                caption={{ value: e.score.toFixed(1), label: 'Out of 10' }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xl font-bold text-white">{e.verdict}</p>
                <p className="mt-1 text-sm text-[#8a93ad]">{e.verdictNote}</p>
                <dl className="mt-4 space-y-1.5 rounded-xl bg-[#1a2030] p-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#8a93ad]">
                      Test pass % <span className="text-[#6e778f]">× {WEIGHTS.testPass}</span>
                    </dt>
                    <dd className="font-semibold text-white tabular-nums">{e.weights.testPass}%</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#8a93ad]">
                      Performance <span className="text-[#6e778f]">× {WEIGHTS.performance}</span>
                    </dt>
                    <dd className="font-semibold text-white tabular-nums">{e.weights.performance}%</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#8a93ad]">
                      Accessibility <span className="text-[#6e778f]">× {WEIGHTS.accessibility}</span>
                    </dt>
                    <dd className="font-semibold text-white tabular-nums">{e.weights.accessibility}%</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-[#252a3a] pt-1.5">
                    <dt className="text-[#8a93ad]">=</dt>
                    <dd className="font-semibold text-white tabular-nums">
                      {weighted(e).toFixed(1)} / 100 · {(weighted(e) / 10).toFixed(1)} / 10
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </DarkPanel>

          <DarkPanel title="Test case pass / fail">
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <Donut
                dark
                segments={testSegments}
                center={{ value: `${passRate.toFixed(1)}%`, label: 'Pass rate' }}
              />
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                <DarkStat label="Total" value={t.total} tone="blue" />
                <DarkStat label="Passed" value={t.passed} tone="green" />
                <DarkStat label="Failed" value={t.failed} tone="red" />
                <DarkStat label="Blocked" value={t.blocked} tone="amber" />
              </div>
            </div>
          </DarkPanel>
        </div>

        <DarkPanel title="Executive summary">
          <p className="mb-2 text-sm font-semibold text-[#c2c9db]">
            A. Test cases pass / fail
          </p>
          <StackedBar dark height={30} segments={testSegments} />
          <div className="mt-3">
            <Legend dark inline segments={testSegments} total={t.total} />
          </div>

          <p className="mt-6 mb-2 text-sm font-semibold text-[#c2c9db]">
            B. Defect classification
          </p>
          <StackedBar dark height={30} segments={defectSegments} />
          <ul className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {defectSegments.map((s) => (
              <li
                key={s.label}
                className="rounded-xl bg-[#1a2030] p-3"
                style={{ borderLeft: `3px solid ${s.color}` }}
              >
                <p className="text-[11px] font-semibold tracking-[.08em] uppercase" style={{ color: s.color }}>
                  {s.label}
                </p>
                <p className="mt-0.5 text-2xl font-bold text-white tabular-nums">{s.value}</p>
                <p className="text-xs text-[#6e778f]">{share(s.value, defectTotal)} share</p>
              </li>
            ))}
          </ul>
        </DarkPanel>
      </RailShell>
      <DashNote>
        Recreation on synthetic data · {qualityEngagements.length} engagements · score = test pass × {WEIGHTS.testPass} + performance × {WEIGHTS.performance} + accessibility × {WEIGHTS.accessibility}
      </DashNote>
    </>
  );
}
