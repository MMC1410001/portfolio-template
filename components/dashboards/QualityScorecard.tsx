'use client';
/**
 * Recreation of the release quality scorecard.
 *
 * ── The score is shown with its inputs, always ────────────────────────────
 * A single number per product is what makes this dashboard useful and also
 * what makes it dangerous: "78" invites a negotiation about the number rather
 * than about the product. The original answers that by never showing the
 * score without the three components that produced it and the defect counts
 * underneath, one click away. That is why the card expands rather than links
 * out, the evidence has to be reachable in the same breath as the claim, or
 * the claim gets argued with in a meeting instead.
 *
 * ── Ready is a field, not a threshold on the score ────────────────────────
 * `ready` is stored per product rather than derived from `score > 80`,
 * because the two genuinely came apart: one product scores 78 and is
 * deliberately not ready, since its scope is a demo pilot and the untested
 * area is known. A derived flag would have overruled that judgement and
 * quietly reported a pilot as shippable.
 */
import { useState } from 'react';
import {
  scorecardProducts,
  type ScorecardProduct,
} from '@/content/dashboards-demo';
import { SEVERITY_COLOR, share } from './charts';
import { DarkFrame, DarkHeader, DarkLivePill, DarkPill, DashNote } from './shell';

/** Score bands match the original's card colouring. */
function scoreColor(score: number) {
  if (score >= 90) return '#22c55e';
  if (score >= 75) return '#a3cc3a';
  if (score >= 50) return '#eab308';
  return '#ef4444';
}

function Delta({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${up ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}
    >
      {up ? '↑' : '↓'} {up ? '+' : ''}
      {value}
    </span>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-24 shrink-0 text-xs text-[#8a93ad]">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#252a3a]">
        <span
          className="block h-full rounded-full"
          style={{ width: `${value}%`, background: scoreColor(value) }}
        />
      </span>
      <span className="w-9 shrink-0 text-right text-xs font-bold text-white tabular-nums">
        {value}
      </span>
    </div>
  );
}

function Card({ p }: { p: ScorecardProduct }) {
  const [open, setOpen] = useState(false);
  const closure = share(p.defects.closed, p.defects.total);
  const bySeverity = [
    { label: 'Critical', value: p.defects.critical, color: SEVERITY_COLOR.Critical },
    { label: 'High', value: p.defects.high, color: SEVERITY_COLOR.High },
    { label: 'Medium', value: p.defects.medium, color: SEVERITY_COLOR.Medium },
    { label: 'Low', value: p.defects.low, color: SEVERITY_COLOR.Low },
  ];
  return (
    <section
      className={`overflow-hidden rounded-2xl border bg-[#161b28] transition ${open ? 'border-indigo-500/60' : 'border-[#222839]'}`}
    >
      <div className="flex items-start gap-4 p-5">
        <div className="min-w-0 flex-1">
          <h4 className="text-lg font-bold text-white">{p.name}</h4>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <DarkPill
              label={p.ready ? '● READY' : '● NOT READY'}
              color={p.ready ? '#22c55e' : '#ef4444'}
            />
          </div>
          <p className="mt-3 text-sm text-[#8a93ad] italic">{p.headline}</p>
        </div>
        <div className="shrink-0 text-center">
          <span
            className="grid size-16 place-items-center rounded-full text-xl font-bold text-[#0f131e]"
            style={{ background: scoreColor(p.score) }}
          >
            {p.score}
          </span>
          <span className="mt-2 block">
            <Delta value={p.delta} />
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between border-t border-[#222839] px-5 py-3 text-sm text-[#c2c9db] hover:bg-[#1b2030]"
      >
        {open ? 'Hide details' : 'View details'}
        <span aria-hidden className="text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <div className="border-t border-[#222839] px-5 pt-4 pb-5">
          <p className="text-[11px] font-semibold tracking-[.08em] text-[#8a93ad] uppercase">Summary</p>
          <p className="mt-2 text-sm leading-relaxed text-[#c2c9db]">{p.summary}</p>

          <p className="mt-5 text-[11px] font-semibold tracking-[.08em] text-[#8a93ad] uppercase">Score breakdown</p>
          <div className="mt-2">
            <ScoreBar label="Reliability" value={p.breakdown.reliability} />
            <ScoreBar label="Speed" value={p.breakdown.speed} />
            <ScoreBar label="Inclusive" value={p.breakdown.inclusive} />
          </div>

          <p className="mt-5 text-[11px] font-semibold tracking-[.08em] text-[#8a93ad] uppercase">Defect closure</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              ['Closed', p.defects.closed, 'text-emerald-400'],
              ['Total', p.defects.total, 'text-white'],
              ['% closed', closure, 'text-white'],
            ].map(([label, value, cls]) => (
              <div key={String(label)} className="rounded-lg bg-[#1a2030] p-3 text-center">
                <p className="text-[10px] font-semibold tracking-[.08em] text-[#8a93ad] uppercase">{label}</p>
                <p className={`mt-1 text-lg font-bold tabular-nums ${cls}`}>{value}</p>
              </div>
            ))}
          </div>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[#252a3a]">
            <span
              className="block h-full rounded-full bg-emerald-500"
              style={{ width: closure }}
            />
          </span>
          <ul className="mt-2 grid grid-cols-4 gap-2">
            {bySeverity.map((s) => (
              <li key={s.label} className="rounded-lg bg-[#1a2030] p-2.5 text-center">
                <p className="text-[10px] font-semibold tracking-[.06em] uppercase" style={{ color: s.color }}>{s.label}</p>
                <p className="mt-0.5 text-base font-bold text-white tabular-nums">{s.value}</p>
              </li>
            ))}
          </ul>

          <p className="mt-5 text-[11px] font-semibold tracking-[.08em] text-[#8a93ad] uppercase">Risks</p>
          <p className="mt-2 border-l-2 border-amber-400 bg-amber-400/8 py-2.5 pr-3 pl-3 text-sm text-[#c2c9db]">
            {p.risk}
          </p>

          <div className="mt-5 flex items-center justify-between text-[11px] font-semibold tracking-[.08em] text-[#8a93ad] uppercase">
            Automation coverage
            <span className="text-white tabular-nums">{p.automation}%</span>
          </div>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[#252a3a]">
            <span
              className="block h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500"
              style={{ width: `${p.automation}%` }}
            />
          </span>
        </div>
      ) : null}
    </section>
  );
}

export function QualityScorecard() {
  const ready = scorecardProducts.filter((p) => p.ready).length;

  return (
    <DarkFrame>
      <DarkHeader
        mark="QS"
        title="Client projects, quality scorecard"
        subtitle="Live quality scores out of 100 · open a card for the evidence behind the score"
        badge={<DarkLivePill time="10:01:26" />}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#222839] bg-[#161b28] p-5">
          <p className="text-[11px] font-semibold tracking-[.08em] text-[#8a93ad] uppercase">Number of products</p>
          <p className="mt-1 text-4xl font-bold text-white tabular-nums">{scorecardProducts.length}</p>
        </div>
        <div className="rounded-2xl border border-[#222839] bg-[#161b28] p-5">
          <p className="text-[11px] font-semibold tracking-[.08em] text-[#8a93ad] uppercase">Ready to release</p>
          <p className="mt-1 text-4xl font-bold text-emerald-400 tabular-nums">{ready}</p>
        </div>
        <div className="rounded-2xl border border-[#222839] bg-[#161b28] p-5">
          <p className="text-[11px] font-semibold tracking-[.08em] text-[#8a93ad] uppercase">Not ready</p>
          <p className="mt-1 text-4xl font-bold text-red-400 tabular-nums">{scorecardProducts.length - ready}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {scorecardProducts.map((p) => (
          <Card key={p.id} p={p} />
        ))}
      </div>

      <DashNote dark>
        Recreation on synthetic data · {scorecardProducts.length} products · scores are weighted from reliability, speed and inclusivity
      </DashNote>
    </DarkFrame>
  );
}
