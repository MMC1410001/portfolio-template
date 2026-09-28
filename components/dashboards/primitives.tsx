'use client';
/**
 * Shared furniture for the `/dashboards` recreations.
 *
 * ── Why a primitive set rather than shadcn's Card ──────────────────────────
 * These pages reproduce Apps Script dashboards, not this site's admin. The
 * originals share one visual language, a near-white canvas, white cards with
 * a soft shadow, a coloured rule on stat tiles, pill-shaped status chips, and
 * that language is *not* the portfolio's. Building them out of `components/ui`
 * would drag in this site's tokens and quietly restyle someone else's design,
 * which defeats the point of showing it.
 *
 * ── Fixed palette, not theme tokens ───────────────────────────────────────
 * Colours here are literal Tailwind classes rather than `var(--chart-N)`. The
 * recreations must look the same whatever the surrounding page is doing, and
 * `Portfolio.tsx` puts `.dark` on <html> for immersive mode, a token-driven
 * panel would flip to a dark palette the original never had.
 */
import type { ReactNode } from 'react';
import type { Person } from '@/content/dashboards-data/common';

/* ─────────────────────────────── chrome ────────────────────────────────── */

export function DashFrame({ children }: { children: ReactNode }) {
  return (
    <div className="dash-frame rounded-2xl bg-[#eef1f7] p-4 text-[#1f2937] sm:p-6 lg:p-8">
      {children}
    </div>
  );
}

export function DashHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle: string;
  badge?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-2xl font-bold tracking-tight text-[#111827] sm:text-3xl">
          {title}
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-[#6b7280]">{subtitle}</p>
      </div>
      {badge}
    </header>
  );
}

/** The "● Live · 09:58:09" pill. The clock is a prop: see LiveClock's note. */
export function LivePill({ time }: { time: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-[#374151] shadow-sm">
      <span className="size-2 rounded-full bg-emerald-500" />
      Live · {time}
    </span>
  );
}

/**
 * A white card with an eyebrow title.
 *
 * `outline` is the hairline-bordered variant the rail dashboards use, where a
 * shadow would read as a second elevation beside the rail. It exists so those
 * boards stop carrying their own near-identical `Card`: three had one, with
 * two different border colours for the same edge. `#e9ecf4` is the one the
 * light rail already uses in shell.tsx, so that is the one that survived.
 */
export function Panel({
  title,
  sub,
  right,
  children,
  outline = false,
  className = '',
}: {
  title?: string;
  /** One line under the title, the chart's own caption. */
  sub?: string;
  right?: ReactNode;
  children: ReactNode;
  outline?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`bg-white p-5 ${outline ? 'rounded-xl border border-[#e9ecf4]' : 'rounded-2xl shadow-[0_1px_3px_rgba(16,24,40,.08)]'} ${className}`}
    >
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-xs font-semibold tracking-[.08em] text-[#6b7280] uppercase">
              {title}
            </h4>
            {sub ? <p className="mt-0.5 text-xs text-[#6b7280]">{sub}</p> : null}
          </div>
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/* ──────────────────────────────── stats ────────────────────────────────── */

export type Tone =
  | 'indigo'
  | 'green'
  | 'amber'
  | 'blue'
  | 'violet'
  | 'slate'
  | 'red';

const RULE: Record<Tone, string> = {
  indigo: 'bg-indigo-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  slate: 'bg-slate-400',
  red: 'bg-red-500',
};

const TEXT: Record<Tone, string> = {
  indigo: 'text-indigo-600',
  green: 'text-emerald-600',
  amber: 'text-amber-600',
  blue: 'text-blue-600',
  violet: 'text-violet-600',
  slate: 'text-slate-500',
  red: 'text-red-600',
};

/** Stat tile with the original's coloured rule down its left edge. */
export function StatTile({
  label,
  value,
  note,
  tone = 'indigo',
  emphasise = false,
}: {
  label: string;
  value: string | number;
  note: string;
  tone?: Tone;
  emphasise?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,.08)]">
      <span className={`absolute inset-y-0 left-0 w-1 ${RULE[tone]}`} />
      <p className="text-[11px] font-semibold tracking-[.08em] text-[#6b7280] uppercase">
        {label}
      </p>
      <p
        className={`mt-1 font-bold tabular-nums ${emphasise ? `text-2xl ${TEXT[tone]}` : 'text-4xl text-[#111827]'}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-[#6b7280]">{note}</p>
    </div>
  );
}

/** Horizontal bar with a right-aligned count, breakdowns and workload. */
export function BarRow({
  label,
  value,
  max,
  tone = 'indigo',
  gradient = false,
}: {
  label: string;
  value: number;
  max: number;
  tone?: Tone;
  gradient?: boolean;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-4 py-1.5">
      <span className="w-40 shrink-0 truncate text-sm text-[#374151]">
        {label}
      </span>
      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#eef1f7]">
        <span
          className={`block h-full rounded-full ${gradient ? 'bg-gradient-to-r from-sky-500 to-indigo-600' : RULE[tone]}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-[#111827]">
        {value}
      </span>
    </div>
  );
}

/* ──────────────────────────────── chips ────────────────────────────────── */

export function AvatarChip({
  person,
  boxed = false,
}: {
  person: Person;
  boxed?: boolean;
}) {
  return (
    <span
      className={
        boxed
          ? 'inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white py-1 pr-3 pl-1 text-sm text-[#374151]'
          : 'inline-flex items-center gap-2 rounded-full bg-[#f3f4f6] py-1 pr-3 pl-1 text-sm text-[#374151]'
      }
    >
      <span
        className={`grid size-6 place-items-center rounded-full text-[10px] font-bold ${person.tone}`}
      >
        {person.initials}
      </span>
      {person.name}
    </span>
  );
}

const PILL: Record<Tone, string> = {
  indigo: 'bg-indigo-50 text-indigo-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-blue-50 text-blue-700',
  violet: 'bg-violet-50 text-violet-700',
  slate: 'bg-slate-100 text-slate-600',
  red: 'bg-red-50 text-red-700',
};

export function StatusPill({
  label,
  tone,
  dot = true,
}: {
  label: string;
  tone: Tone;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${PILL[tone]}`}
    >
      {dot ? <span className={`size-1.5 rounded-full ${RULE[tone]}`} /> : null}
      {label}
    </span>
  );
}

export function Tag({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-md bg-[#f3f4f6] px-2 py-1 text-xs font-medium text-[#4b5563]">
      {label}
    </span>
  );
}

/* ──────────────────────────────── filters ──────────────────────────────── */

export interface FilterSelect {
  /**
   * What the select filters by. Required: the visible text of a select is its
   * current value, "All", which names nothing, so without this a screen
   * reader announces two identical unlabelled combo boxes.
   */
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}

const FIELD =
  'rounded-xl border border-[#e5e7eb] bg-[#f9fafb] text-sm focus:border-indigo-400';

/**
 * Search, selects, an optional reset and an optional count.
 *
 * `labelled` prints each control's label above it, which is how the rail
 * dashboards lay their filter card out; otherwise the labels are carried by
 * `aria-label` and the placeholder. Either way every control is named.
 */
export function FilterBar({
  query,
  onQuery,
  placeholder,
  selects,
  count,
  onReset,
  labelled = false,
}: {
  query: string;
  onQuery: (v: string) => void;
  placeholder: string;
  selects: FilterSelect[];
  count?: ReactNode;
  onReset?: () => void;
  labelled?: boolean;
}) {
  const caption = (text: string) => (
    <span
      className={
        labelled
          ? 'mb-1 block text-[11px] font-semibold tracking-[.08em] text-[#6b7280] uppercase'
          : 'sr-only'
      }
    >
      {text}
    </span>
  );
  return (
    <div
      className={`mb-4 flex flex-wrap gap-3 last:mb-0 ${labelled ? 'items-end' : 'items-center'}`}
    >
      <label className="min-w-55 flex-1">
        {caption(labelled ? 'Search' : placeholder)}
        <span className="relative block">
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 stroke-[#9ca3af]"
            fill="none"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={placeholder}
            className={`w-full py-2.5 pr-3 pl-9 text-[#111827] placeholder:text-[#6b7280] ${FIELD}`}
          />
        </span>
      </label>
      {selects.map((s) =>
        labelled ? (
          <label key={s.label}>
            {caption(s.label)}
            <select
              value={s.value}
              onChange={(e) => s.onChange(e.target.value)}
              className={`block px-3 py-2.5 text-[#374151] ${FIELD}`}
            >
              {s.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        ) : (
          <select
            key={s.label}
            aria-label={s.label}
            value={s.value}
            onChange={(e) => s.onChange(e.target.value)}
            className={`px-3 py-2.5 text-[#374151] ${FIELD}`}
          >
            {s.options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        ),
      )}
      {onReset ? (
        <button
          type="button"
          onClick={onReset}
          className="rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-sm text-[#4b5563] hover:bg-[#f9fafb]"
        >
          <span aria-hidden>↺ </span>Reset
        </button>
      ) : null}
      {count ? (
        <span className="ml-auto rounded-full bg-[#f3f4f6] px-3 py-1.5 text-sm text-[#4b5563]">
          {count}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Sortable column header. Arrow direction mirrors the originals.
 *
 * The arrow is decoration for sighted readers; `aria-sort` on the header is
 * what tells a screen reader which column the table is ordered by, and it is
 * only set on the active column, as the ARIA spec asks.
 */
export function Th({
  label,
  active,
  dir,
  onSort,
  className = '',
}: {
  label: string;
  active?: boolean;
  dir?: 'asc' | 'desc';
  onSort?: () => void;
  className?: string;
}) {
  return (
    <th
      scope="col"
      aria-sort={
        onSort && active ? (dir === 'desc' ? 'descending' : 'ascending') : undefined
      }
      className={`px-3 py-3 text-left text-[11px] font-semibold tracking-[.08em] text-[#6b7280] uppercase ${className}`}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          className="inline-flex items-center gap-1 hover:text-[#111827]"
        >
          {label}
          <span
            aria-hidden
            className={active ? 'text-indigo-600' : 'text-[#878e9b]'}
          >
            {active && dir === 'desc' ? '▼' : '▲'}
          </span>
        </button>
      ) : (
        label
      )}
    </th>
  );
}
