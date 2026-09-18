'use client';
/**
 * Chart marks for the `/dashboards` recreations.
 *
 * ── Hand-rolled SVG, not a charting library ───────────────────────────────
 * `recharts` is installed and unused, and it stays that way here. Every chart
 * on these pages is a donut, a column run, a horizontal bar or a single
 * stacked row, four shapes, each a dozen lines of SVG. Pulling a charting
 * runtime into a statically-rendered showcase to draw them would cost more
 * bundle than the entire rest of the route and would fight the originals'
 * styling the whole way, since these reproduce Apps Script dashboards rather
 * than this site's design.
 *
 * ── The colours here are status colours, and they are load-bearing ────────
 * Approved/rejected/pending and critical/high/medium/low are *state*, not
 * series identity, so they keep the meanings the originals gave them, green
 * is approved, red is rejected, rather than being reassigned to whatever a
 * categorical palette would hand out. That choice carries an obligation,
 * because red↔green is the pair colour-blind readers cannot separate: every
 * mark in this file is therefore paired with its number, either printed
 * inside the mark or in a legend row beside it, and every chart on these
 * pages sits above the table it was computed from. Identity is never left to
 * colour alone. Dropping a legend to save space breaks that, and it is the
 * one change here that looks cosmetic and is not.
 *
 * ── `dark` is a prop, not a media query ───────────────────────────────────
 * Four of the ten originals are dark dashboards and six are light, on the
 * same page, chosen by a picker. That is a per-recreation fact rather than a
 * viewer preference, so it cannot come from `prefers-color-scheme` or from
 * this site's `.dark` class, which `Portfolio.tsx` toggles for immersive
 * mode and which would otherwise flip a light recreation to a palette its
 * original never had.
 */
import type { ReactNode } from 'react';

export interface Segment {
  label: string;
  value: number;
  color: string;
}

const pct = (value: number, total: number) =>
  total > 0 ? (value / total) * 100 : 0;

/** One decimal, but only when it needs one: 35.5 and 40, never 40.0. */
function round(value: number) {
  return value % 1 === 0 ? value : Number(value.toFixed(1));
}

/** One decimal, but only when it needs one: 35.5% and 40%, never 40.0%. */
export function share(value: number, total: number) {
  const p = pct(value, total);
  return `${p % 1 === 0 ? p : p.toFixed(1)}%`;
}

/* ──────────────────────────────── donut ────────────────────────────────── */

export function Donut({
  segments,
  center,
  size = 168,
  thickness = 22,
  dark = false,
}: {
  segments: Segment[];
  center?: { value: ReactNode; label: string };
  size?: number;
  thickness?: number;
  dark?: boolean;
}) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  // A 2px gap between fills. Segments narrower than the gap would render
  // inside out, so they keep their full length.
  const gap = 2;
  // Arc lengths and their running start, resolved before the map rather than
  // accumulated inside it: `react/react-compiler` rejects a variable mutated
  // during render, and a running total is exactly that.
  const arcs = segments.map((s, i) => ({
    ...s,
    len: (s.value / (total || 1)) * c,
    offset: segments
      .slice(0, i)
      .reduce((n, prev) => n + (prev.value / (total || 1)) * c, 0),
  }));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <title>
          {segments.map((s) => `${s.label}: ${s.value}`).join(', ')}
        </title>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          stroke={dark ? '#252a3a' : '#eef1f7'}
        />
        {arcs
          .filter((s) => s.value > 0)
          .map((s) => (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={thickness}
              stroke={s.color}
              strokeDasharray={`${s.len > gap ? s.len - gap : s.len} ${c - (s.len > gap ? s.len - gap : s.len)}`}
              strokeDashoffset={-s.offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            >
              <title>{`${s.label}: ${s.value} (${share(s.value, total)})`}</title>
            </circle>
          ))}
      </svg>
      {center ? (
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <p
            className={`text-2xl font-bold tabular-nums ${dark ? 'text-white' : 'text-[#111827]'}`}
          >
            {center.value}
          </p>
          <p
            className={`text-[10px] font-semibold tracking-[.08em] uppercase ${dark ? 'text-[#8a93ad]' : 'text-[#9ca3af]'}`}
          >
            {center.label}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Single-arc progress ring, the score dials. */
export function Ring({
  value,
  max = 100,
  color,
  size = 150,
  thickness = 14,
  caption,
  dark = false,
}: {
  value: number;
  max?: number;
  color: string;
  size?: number;
  thickness?: number;
  caption: { value: ReactNode; label: string };
  dark?: boolean;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const len = Math.max(0, Math.min(value / max, 1)) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {/* `value` is a raw average on some callers, so it is rounded here
            rather than at every call site: this string is the ring's
            accessible name and its hover tooltip, and "44.018518518518526 out
            of 100" is what an unformatted average reads as to a screen
            reader. The visible figure already comes formatted in `caption`. */}
        <title>{`${caption.label}: ${round(value)} out of ${max}`}</title>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          stroke={dark ? '#2b3145' : '#eef1f7'}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={`${len} ${c - len}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
        <p
          className={`text-3xl font-bold tabular-nums ${dark ? 'text-white' : 'text-[#111827]'}`}
        >
          {caption.value}
        </p>
        <p
          className={`text-[10px] font-semibold tracking-[.08em] uppercase ${dark ? 'text-[#8a93ad]' : 'text-[#9ca3af]'}`}
        >
          {caption.label}
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────── legend ────────────────────────────────── */

/**
 * Always rendered beside a chart of two or more series, and always carrying
 * the value. See the note at the top of the file on why the number is not
 * optional here.
 */
export function Legend({
  segments,
  total,
  dark = false,
  inline = false,
}: {
  segments: Segment[];
  total?: number;
  dark?: boolean;
  inline?: boolean;
}) {
  const sum = total ?? segments.reduce((n, s) => n + s.value, 0);
  return (
    <ul
      className={
        inline
          ? 'flex flex-wrap items-center gap-x-5 gap-y-1.5'
          : 'min-w-0 flex-1 space-y-1'
      }
    >
      {segments.map((s) => (
        <li
          key={s.label}
          className={
            inline
              ? 'flex items-center gap-2 text-xs'
              : `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${dark ? 'bg-[#1e2334]' : 'bg-[#f9fafb]'}`
          }
        >
          <span
            className="size-2.5 shrink-0 rounded-[3px]"
            style={{ background: s.color }}
          />
          <span
            className={`truncate ${dark ? 'text-[#c2c9db]' : 'text-[#374151]'}`}
          >
            {s.label}
          </span>
          <span
            className={`ml-auto shrink-0 font-semibold tabular-nums ${dark ? 'text-white' : 'text-[#111827]'}`}
          >
            {s.value}
          </span>
          {sum > 0 ? (
            <span
              className={`shrink-0 text-xs tabular-nums ${dark ? 'text-[#8a93ad]' : 'text-[#9ca3af]'}`}
            >
              {share(s.value, sum)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* ──────────────────────────── stacked bar row ──────────────────────────── */

/** One row, segments labelled in place, the project-wise effort bars. */
export function StackedBar({
  segments,
  height = 26,
  dark = false,
}: {
  segments: Segment[];
  height?: number;
  dark?: boolean;
}) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  return (
    <div
      className={`flex w-full overflow-hidden rounded-md ${dark ? 'bg-[#252a3a]' : 'bg-[#eef1f7]'}`}
      style={{ height }}
    >
      {/* The bar is a run of divs rather than one SVG, so the reading for a
          screen reader is spelled out here; the Legend beside it repeats the
          same numbers visually. */}
      <span className="sr-only">
        {segments.map((s) => `${s.label}: ${s.value}`).join(', ')}
      </span>
      {segments
        .filter((s) => s.value > 0)
        .map((s, i) => (
          <span
            key={s.label}
            title={`${s.label}: ${s.value} (${share(s.value, total)})`}
            className="grid place-content-center overflow-hidden text-[11px] font-semibold text-white tabular-nums"
            style={{
              width: `${pct(s.value, total)}%`,
              background: s.color,
              marginLeft: i > 0 ? 2 : 0,
            }}
          >
            {pct(s.value, total) > 7 ? s.value : ''}
          </span>
        ))}
    </div>
  );
}

/* ────────────────────────────── column run ─────────────────────────────── */

/** Vertical bars with the value printed above each, the month-wise chart. */
export function Columns({
  data,
  color = '#7ba7f0',
  dark = false,
}: {
  data: { label: string; value: number }[];
  color?: string;
  dark?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  return (
    <div className="flex gap-3">
      <ul
        className={`flex w-12 shrink-0 flex-col-reverse justify-between py-5 text-right text-[11px] tabular-nums ${dark ? 'text-[#8a93ad]' : 'text-[#9ca3af]'}`}
      >
        {ticks.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <div className="min-w-0 flex-1">
        <div
          className={`relative flex h-58 items-end gap-2 border-b sm:gap-4 ${dark ? 'border-[#2b3145]' : 'border-[#e5e7eb]'}`}
        >
          {ticks.slice(1).map((t, i) => (
            <span
              key={t}
              aria-hidden
              className={`absolute inset-x-0 border-t border-dashed ${dark ? 'border-[#252a3a]' : 'border-[#f0f2f7]'}`}
              style={{ bottom: `${((i + 1) / 4) * 100}%` }}
            />
          ))}
          {data.map((d) => (
            <div
              key={d.label}
              className="relative flex min-w-0 flex-1 flex-col items-center justify-end"
            >
              <span
                className={`mb-1 text-xs font-semibold tabular-nums ${dark ? 'text-white' : 'text-[#374151]'}`}
              >
                {d.value}
              </span>
              <span
                title={`${d.label}: ${d.value}`}
                className="w-full max-w-14 rounded-t-[4px]"
                style={{
                  height: `${(d.value / max) * 82}%`,
                  background: color,
                }}
              />
            </div>
          ))}
        </div>
        <ul
          className={`mt-2 flex gap-2 text-center text-[11px] sm:gap-4 ${dark ? 'text-[#8a93ad]' : 'text-[#6b7280]'}`}
        >
          {data.map((d) => (
            <li key={d.label} className="min-w-0 flex-1 truncate">
              {d.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ─────────────────────────── horizontal bars ───────────────────────────── */

/** Ranked horizontal bars with an axis, "by assignee", "by module". */
export function HBars({
  data,
  dark = false,
  labelWidth = 'w-28',
}: {
  data: { label: string; value: number; color?: string }[];
  dark?: boolean;
  labelWidth?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.label} className="flex items-center gap-3">
          <span
            className={`${labelWidth} shrink-0 truncate text-right text-xs ${dark ? 'text-[#c2c9db]' : 'text-[#6b7280]'}`}
          >
            {d.label}
          </span>
          <span
            className={`h-4 flex-1 overflow-hidden rounded-[4px] ${dark ? 'bg-[#252a3a]' : 'bg-[#f3f4f6]'}`}
          >
            <span
              title={`${d.label}: ${d.value}`}
              className="block h-full rounded-[4px]"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: d.color ?? '#5b6bd8',
              }}
            />
          </span>
          <span
            className={`w-8 shrink-0 text-right text-xs font-semibold tabular-nums ${dark ? 'text-white' : 'text-[#111827]'}`}
          >
            {d.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ──────────────────────────── shared palettes ──────────────────────────── */

/** Severity keeps the originals' meanings. See the file header. */
export const SEVERITY_COLOR = {
  Critical: '#dc2626',
  High: '#ea8c1f',
  Medium: '#3b82f6',
  Low: '#22c55e',
} as const;

export const APPROVAL_COLOR = {
  approved: '#22c55e',
  rejected: '#ef4444',
  pending: '#eab308',
} as const;

export const STATE_COLOR = {
  closed: '#22c55e',
  open: '#ef4444',
  observation: '#8b5cf6',
  reopened: '#f59e0b',
  invalid: '#eab308',
  blocked: '#9ca3af',
  notRun: '#eab308',
  enhancement: '#22c55e',
  bug: '#ef4444',
} as const;
