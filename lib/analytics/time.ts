/**
 * Time, pinned to Asia/Kolkata.
 *
 * India is UTC+05:30 with **no DST**, so the offset is a constant and no
 * timezone database is needed anywhere. Fixed-offset arithmetic rather than
 * Intl.DateTimeFormat: exact for India, no ICU dependency, and no chance of a
 * trimmed-ICU Workers build silently falling back to UTC.
 *
 * Why pin at all: otherwise "Today" means something different for whoever is
 * reading the panel, and two people quote different numbers for the same word.
 *
 * ── The index rule that makes the SQL side safe ────────────────────────────
 * The window filter must always be on the raw integer column
 * (`created_at >= ?1 AND created_at <= ?2`, which an index serves), and the IST
 * expression must appear ONLY in GROUP BY / SELECT. Putting
 * `date(created_at/1000+19800,'unixepoch') >= ?` in a WHERE clause both
 * defeats every index and re-opens the boundary bug from the other side.
 *
 * Lumen shipped that bug: it used SQL's `'localtime'` modifier, which
 * resolves against the *server's* zone (UTC on a Worker) so everything
 * between 00:00 and 05:30 IST counted against the previous day.
 */

export const IST_OFFSET_MINUTES = 330;
export const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60_000;
export const TZ_LABEL = 'IST';

const DAY_MS = 86_400_000;

/** Epoch ms of IST midnight for the IST day containing `at`. */
export function istDayStart(at: number): number {
  return Math.floor((at + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

/**
 * The IST calendar date as 'YYYY-MM-DD'.
 *
 * Must produce the same string the SQL expression produces, 
 * `date(created_at / 1000 + 19800, 'unixepoch')`. That equivalence is worth a
 * test case: seed an event at 02:00 IST and assert which day it lands on. It
 * is the exact case that was wrong in the source system.
 */
export function istDayKey(at: number): string {
  return new Date(at + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' in IST -> epoch ms of that IST midnight. */
export function istDayKeyToMs(key: string): number | null {
  const parsed = Date.parse(`${key}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed - IST_OFFSET_MS : null;
}

export type RangeId = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'custom';

export const RANGE_PRESETS: readonly { id: RangeId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'custom', label: 'Custom' },
];

export interface Window {
  since: number;
  until: number;
  days: number;
}

/**
 * The hard cap on a window, in days.
 *
 * Still matters here for three reasons that have nothing to do with the source
 * system's Postgres: it bounds the recursive day CTE to <= 366 rows, it bounds
 * the new-vs-returning EXISTS scan, and it bounds the daily-series response.
 */
export const MAX_RANGE_DAYS = 366;

/**
 * Resolve a preset to bounds.
 *
 * today / yesterday are IST **calendar** days; 7d/30d/90d are **rolling**.
 * Changing the latter to calendar would silently move every number an operator
 * has already seen.
 */
export function resolveRange(
  id: RangeId,
  now: number,
  custom?: { from?: string; to?: string },
): Window {
  if (id === 'today') {
    return windowOf(istDayStart(now), now);
  }
  if (id === 'yesterday') {
    const start = istDayStart(now) - DAY_MS;
    return windowOf(start, start + DAY_MS - 1);
  }
  if (id === 'custom') {
    const a = custom?.from ? istDayKeyToMs(custom.from) : null;
    const b = custom?.to ? istDayKeyToMs(custom.to) : null;
    if (a === null || b === null) return windowOf(now - 30 * DAY_MS, now);
    // Sorted, because a picker is easily left with `to` earlier than `from`
    // mid-edit, and an inverted range does not error, it returns an empty
    // panel that reads as "no traffic".
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    return windowOf(lo, hi + DAY_MS - 1);
  }
  const days = id === '7d' ? 7 : id === '30d' ? 30 : 90;
  return windowOf(now - days * DAY_MS, now);
}

function windowOf(since: number, until: number): Window {
  const capped = Math.max(since, until - MAX_RANGE_DAYS * DAY_MS);
  return {
    since: capped,
    until,
    days: Math.max(1, Math.ceil((until - capped) / DAY_MS)),
  };
}

/**
 * Parse a window off an admin request, with the same cap and ordering fix.
 *
 * Ported from Lumen's readWindow(), including the part that matters most:
 * an inverted range is sorted rather than rejected.
 */
export function readWindow(input: {
  from?: unknown;
  to?: unknown;
  range?: unknown;
  now?: number;
}): Window {
  const now = input.now ?? Date.now();
  const from = Number(input.from);
  const to = Number(input.to);

  if (Number.isFinite(from) && Number.isFinite(to)) {
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    return windowOf(lo, hi);
  }

  const id = typeof input.range === 'string' ? input.range : '30d';
  const known = RANGE_PRESETS.some((p) => p.id === id);
  return resolveRange(known ? (id as RangeId) : '30d', now);
}

/** Human description of a window, always naming the zone. */
export function describeRange(w: Window): string {
  return `${istDayKey(w.since)} to ${istDayKey(w.until)} (${TZ_LABEL})`;
}
