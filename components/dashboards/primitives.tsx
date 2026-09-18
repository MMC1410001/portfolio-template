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
import type { Person } from '@/content/dashboards-demo';

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

export function Panel({
  title,
  right,
  children,
  className = '',
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,.08)] ${className}`}
    >
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h4 className="text-xs font-semibold tracking-[.08em] text-[#6b7280] uppercase">
            {title}
          </h4>
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
      <p className="mt-1 text-xs text-[#9ca3af]">{note}</p>
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

export function FilterBar({
  query,
  onQuery,
  placeholder,
  selects,
  count,
}: {
  query: string;
  onQuery: (v: string) => void;
  placeholder: string;
  selects: {
    value: string;
    onChange: (v: string) => void;
    options: string[];
  }[];
  count: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <label className="relative min-w-55 flex-1">
        <span className="sr-only">{placeholder}</span>
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
          className="w-full rounded-xl border border-[#e5e7eb] bg-[#f9fafb] py-2.5 pr-3 pl-9 text-sm text-[#111827] outline-none placeholder:text-[#9ca3af] focus:border-indigo-400"
        />
      </label>
      {selects.map((s, i) => (
        <select
          key={i}
          value={s.value}
          onChange={(e) => s.onChange(e.target.value)}
          className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2.5 text-sm text-[#374151] outline-none focus:border-indigo-400"
        >
          {s.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ))}
      <span className="ml-auto rounded-full bg-[#f3f4f6] px-3 py-1.5 text-sm text-[#6b7280]">
        {count}
      </span>
    </div>
  );
}

/** Sortable column header. Arrow direction mirrors the originals. */
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
      className={`px-3 py-3 text-left text-[11px] font-semibold tracking-[.08em] text-[#6b7280] uppercase ${className}`}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          className="inline-flex items-center gap-1 hover:text-[#111827]"
        >
          {label}
          <span className={active ? 'text-indigo-600' : 'text-[#c4c9d4]'}>
            {active && dir === 'desc' ? '▼' : '▲'}
          </span>
        </button>
      ) : (
        label
      )}
    </th>
  );
}
