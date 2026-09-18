'use client';
/**
 * Page chrome for the `/dashboards` recreations: the sidebar shells, and the
 * dark-canvas equivalents of the light furniture in `primitives.tsx`.
 *
 * ── Why dark is a separate set rather than a flag on the light one ────────
 * Four of the ten originals are dark dashboards. They are not the light ones
 * with inverted tokens, the dark set uses tinted panels on a navy canvas with
 * a coloured rule down each stat, where the light set uses white cards with a
 * shadow on near-white. Threading a `dark` boolean through every light
 * component would have produced a ternary on every colour in the file and a
 * pair of palettes that drift apart anyway. Two small component sets that each
 * read straight through is the cheaper thing to maintain, and it keeps
 * `primitives.tsx` honest about being one design language.
 *
 * `charts.tsx` does take a `dark` prop, because a chart's geometry genuinely
 * is shared and only its two surface colours change.
 *
 * ── The rail is a nav, and it navigates ───────────────────────────────────
 * Five originals are multi-page: a left rail switches between sections or
 * between the projects a dashboard covers. Rendering the rail as decoration
 * beside a single fixed view would be dishonest about what the thing is, so
 * `RailShell` takes real items and a real selection, and each recreation
 * wires it to state.
 */
import type { ReactNode } from 'react';

export type RailTone = 'light' | 'dark' | 'terracotta' | 'teal';

const RAIL: Record<RailTone, { rail: string; page: string; edge: string }> = {
  light: {
    rail: 'bg-white text-[#374151]',
    page: 'bg-[#f7f8fc] text-[#1f2937]',
    edge: 'border-[#e9ecf4]',
  },
  dark: {
    rail: 'bg-[#141824] text-[#c2c9db]',
    page: 'bg-[#0f131e] text-[#e6e9f2]',
    edge: 'border-[#222839]',
  },
  terracotta: {
    rail: 'bg-[#d97e70] text-white',
    page: 'bg-[#f6f7fa] text-[#1f2937]',
    edge: 'border-[#c86d60]',
  },
  teal: {
    rail: 'bg-gradient-to-b from-[#2f7f76] to-[#1f5f63] text-white',
    page: 'bg-[#f2f5f9] text-[#1f2937]',
    edge: 'border-white/15',
  },
};

export interface RailItem {
  id: string;
  label: string;
  /** Rendered right-aligned: a count badge, or a score chip. */
  badge?: ReactNode;
  /** Renders as a non-interactive section heading above the items below it. */
  heading?: string;
}

export function RailShell({
  tone,
  brand,
  items,
  active,
  onSelect,
  footer,
  children,
}: {
  tone: RailTone;
  brand: ReactNode;
  items: RailItem[];
  active: string;
  onSelect: (id: string) => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = RAIL[tone];
  const dark = tone === 'dark';
  return (
    <div
      className={`dash-frame overflow-hidden rounded-2xl lg:grid lg:grid-cols-[15rem_1fr] ${t.page}`}
    >
      <nav
        className={`flex flex-col border-b lg:border-r lg:border-b-0 ${t.rail} ${t.edge}`}
      >
        <div className={`border-b px-5 py-4 ${t.edge}`}>{brand}</div>
        <ul className="flex flex-wrap gap-1 p-3 lg:flex-1 lg:flex-col lg:flex-nowrap">
          {items.map((item) => (
            <li key={item.id} className="contents">
              {item.heading ? (
                <p
                  className={`mt-3 w-full px-3 pb-1 text-[11px] font-semibold tracking-[.1em] uppercase opacity-60 lg:mt-4`}
                >
                  {item.heading}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={item.id === active ? 'page' : undefined}
                className={`flex w-auto items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition lg:w-full ${
                  item.id === active
                    ? dark
                      ? 'bg-[#232a3d] text-white'
                      : tone === 'light'
                        ? 'bg-[#e7eaff] font-semibold text-[#312e9e] shadow-[inset_3px_0_0_#4f46e5]'
                        : 'bg-white/25 font-semibold text-white'
                    : tone === 'light'
                      ? 'hover:bg-[#f3f5fb]'
                      : 'hover:bg-white/10'
                }`}
              >
                <span className="truncate">{item.label}</span>
                {item.badge ? (
                  <span className="ml-auto shrink-0">{item.badge}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        {footer ? (
          <div className={`border-t px-5 py-3 text-xs opacity-80 ${t.edge}`}>
            {footer}
          </div>
        ) : null}
      </nav>
      <div className="min-w-0 p-4 sm:p-6">{children}</div>
    </div>
  );
}

/* ──────────────────────────── dark furniture ───────────────────────────── */

export function DarkFrame({ children }: { children: ReactNode }) {
  return (
    <div className="dash-frame rounded-2xl bg-[#0f131e] p-4 text-[#e6e9f2] sm:p-6 lg:p-8">
      {children}
    </div>
  );
}

export function DarkHeader({
  title,
  subtitle,
  badge,
  mark,
}: {
  title: string;
  subtitle: string;
  badge?: ReactNode;
  mark?: string;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {mark ? (
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
            {mark}
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {title}
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-[#8a93ad]">{subtitle}</p>
        </div>
      </div>
      {badge}
    </header>
  );
}

export function DarkLivePill({ time }: { time: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-[#1b2030] px-4 py-2 text-sm font-medium text-[#c2c9db]">
      <span className="size-2 rounded-full bg-emerald-400" />
      Live · {time}
    </span>
  );
}

export function DarkPanel({
  title,
  eyebrow,
  right,
  children,
  className = '',
}: {
  title?: string;
  eyebrow?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-[#222839] bg-[#161b28] p-5 ${className}`}
    >
      {title || eyebrow ? (
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            {eyebrow ? (
              <p className="text-[11px] font-semibold tracking-[.1em] text-indigo-400 uppercase">
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h4 className="text-xs font-semibold tracking-[.08em] text-[#c2c9db] uppercase">
                {title}
              </h4>
            ) : null}
          </div>
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export type DarkTone = 'indigo' | 'violet' | 'green' | 'red' | 'amber' | 'blue';

const DARK_RULE: Record<DarkTone, string> = {
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  amber: 'bg-amber-400',
  blue: 'bg-sky-500',
};

/** Dark stat tile: coloured rule on the left, value, optional unit. */
export function DarkStat({
  label,
  value,
  unit,
  note,
  tone = 'indigo',
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: string;
  tone?: DarkTone;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-[#1a2030] p-4">
      <span className={`absolute inset-y-0 left-0 w-1 ${DARK_RULE[tone]}`} />
      <p className="text-[11px] font-semibold tracking-[.08em] text-[#8a93ad] uppercase">
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold text-white tabular-nums">
        {value}
        {unit ? (
          <span className="ml-1 text-base font-medium text-[#8a93ad]">
            {unit}
          </span>
        ) : null}
      </p>
      {note ? <p className="mt-1 text-xs text-[#6e778f]">{note}</p> : null}
    </div>
  );
}

export function DarkTh({
  label,
  className = '',
}: {
  label: string;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-3 text-left text-[11px] font-semibold tracking-[.08em] text-[#8a93ad] uppercase ${className}`}
    >
      {label}
    </th>
  );
}

/** Pill on a dark canvas. `color` is a status colour from charts.tsx. */
export function DarkPill({
  label,
  color,
  solid = false,
}: {
  label: string;
  color: string;
  solid?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={
        solid
          ? { background: color, color: '#0f131e' }
          : { background: `${color}22`, color }
      }
    >
      {label}
    </span>
  );
}

/** Footer line every recreation ends on. */
export function DashNote({
  children,
  dark = false,
}: {
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <p
      className={`mt-5 text-center text-xs ${dark ? 'text-[#6e778f]' : 'text-[#9ca3af]'}`}
    >
      {children}
    </p>
  );
}
