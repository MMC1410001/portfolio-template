/**
 * Presentation helpers for the admin panel.
 *
 * Its own module so the component files export only components, and so these
 * are unit-testable without mounting anything, which matters for `ratio`,
 * `heatColour` and `describeInternal`, all three of which are easy to get
 * subtly wrong in ways nobody notices on screen.
 */

import type {
  Breakdown,
  InternalNotice as InternalSummary,
} from '@/lib/analytics/types';
import { TZ_LABEL } from '@/lib/analytics/time';

export const num = (n: number) => n.toLocaleString('en-IN');

/**
 * A timestamp as "28/09/26, 2:05 pm IST".
 *
 * The zone is pinned, not left to the runtime. `/analytics` is prerendered, so
 * the server's zone (UTC on a Worker) and the visitor's would render two
 * different strings for the same row, a hydration mismatch, and neither of
 * them would be the IST the day buckets use.
 */
const IST_DATE_TIME = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});

export function istDateTime(ms: number): string {
  return `${IST_DATE_TIME.format(ms)} ${TZ_LABEL}`;
}

/**
 * Seconds as "2m 23s".
 *
 * A bare 143.2 reads as a measurement rather than a duration, and every figure
 * here is a duration someone will compare by eye.
 */
export function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Pixels as "7.4k px", a 13,000px page makes raw numbers unreadable. */
export function pixels(px: number): string {
  if (!Number.isFinite(px) || px <= 0) return '0px';
  return px >= 1000 ? `${(px / 1000).toFixed(1)}k px` : `${Math.round(px)}px`;
}

/**
 * A percentage of a base, or null when the base is zero.
 *
 * Null rather than 0, and this is the whole point: "0% of nobody" is not a
 * rate. Rendered as 0% it invites the reader to conclude the step is broken,
 * when the truth is there was nothing to convert.
 *
 * Deliberately not clamped at 100 either, showing 120% is more useful than
 * hiding an anomaly.
 */
export function ratio(part: number, whole: number): number | null {
  if (!whole) return null;
  return Number(((part / whole) * 100).toFixed(1));
}

export const pct = (value: number | null) =>
  value === null ? 'n/a' : `${value}%`;

/**
 * Map a 0-1 intensity to a heatmap colour.
 *
 * Five explicit stops rather than an HSL hue sweep: a plain hue rotation
 * spends most of its range in greens, which makes a moderately-clicked area
 * look as hot as a heavily-clicked one. Ported byte-for-byte, the stops are
 * the calibration.
 */
export function heatColour(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0.0, [30, 64, 175]],
    [0.25, [6, 182, 212]],
    [0.5, [34, 197, 94]],
    [0.75, [250, 204, 21]],
    [1.0, [220, 38, 38]],
  ];

  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i += 1) {
    const [hi, hiColour] = stops[i];
    if (clamped > hi) continue;
    const [lo, loColour] = stops[i - 1];
    const f = hi === lo ? 0 : (clamped - lo) / (hi - lo);
    return [
      Math.round(loColour[0] + (hiColour[0] - loColour[0]) * f),
      Math.round(loColour[1] + (hiColour[1] - loColour[1]) * f),
      Math.round(loColour[2] + (hiColour[2] - loColour[2]) * f),
    ];
  }
  return stops[stops.length - 1][1];
}

export interface InternalDescription {
  headline: string;
  detail: string;
  /** 'warn' when internal traffic is inside the numbers on screen. */
  tone: 'muted' | 'warn';
}

/**
 * Describe the internal-traffic filter's current state.
 *
 * A pure function because **the wording is the feature**. Four states must
 * stay distinguishable, and two of them are easy to conflate:
 *
 *   filter ON,  0 matched, "nothing internal happened this period"
 *   filter OFF, 0 matched, "not filtering, and nothing internal happened"
 *
 * Both show identical totals, so if they render the same sentence the reader
 * cannot tell whether the filter is working or simply had nothing to do. That
 * ambiguity is how a filtered number eventually gets quoted as a real one.
 *
 * The count is stated in BOTH modes for the same reason: reporting it only
 * while filtering would mean the two totals differ between visits with nothing
 * on screen to explain why.
 */
export function describeInternal(
  summary: InternalSummary | undefined,
): InternalDescription | null {
  if (!summary) return null;

  const { excluded, sessionsMatched, cidrsActive, visitorsActive } = summary;

  const rules =
    cidrsActive + visitorsActive === 0
      ? 'No internal networks or visitors are configured yet. Set ' +
        'ANALYTICS_INTERNAL_CIDRS, or use "Stop counting my visits" below.'
      : `Matching ${cidrsActive} network${cidrsActive === 1 ? '' : 's'} and ` +
        `${visitorsActive} visitor${visitorsActive === 1 ? '' : 's'}.`;

  if (excluded) {
    return {
      headline:
        sessionsMatched === 0
          ? 'Showing real visitors. No internal sessions matched in this period.'
          : `Showing real visitors, ${num(sessionsMatched)} internal ` +
            `session${sessionsMatched === 1 ? '' : 's'} hidden.`,
      detail: rules,
      tone: 'muted',
    };
  }

  return {
    headline:
      sessionsMatched === 0
        ? 'Showing all traffic, internal included. None matched in this period.'
        : `Showing all traffic, ${num(sessionsMatched)} internal ` +
          `session${sessionsMatched === 1 ? '' : 's'} counted in these numbers.`,
    detail: rules,
    // Warn only when internal traffic is actually inflating what is on screen.
    tone: sessionsMatched === 0 ? 'muted' : 'warn',
  };
}

/** `'/#work'` handled by sectionLabel; this is for a bare unknown path. */
export const shortPath = (path: string) => path.replace(/^\/#?/, '') || 'page';

/**
 * Keep the two largest categories, fold the rest into one "Other".
 *
 * Lives here rather than beside the pie so a bare Node test can import it.
 * The rule is not cosmetic: a pie asks the reader to compare angles in an
 * all-pairs form, and three is the validated ceiling before a fourth hue
 * stops being separable for colour-blind readers.
 */
export function topTwoPlusOther(rows: Breakdown[]): Breakdown[] {
  if (rows.length <= 3) return rows;
  const [first, second, ...tail] = rows;
  const sessions = tail.reduce((sum, r) => sum + r.sessions, 0);
  const share = tail.reduce((sum, r) => sum + r.share, 0);
  return [
    first,
    second,
    { label: 'Other', sessions, share: Math.round(share * 10) / 10 },
  ];
}

/**
 * Preferred palette slot per known entity, so a label keeps its colour when
 * its rank changes, toggling Real visitors / All traffic reorders slices and
 * must not repaint them. The labels are the fixed vocabulary of
 * `lib/analytics/user-agent.ts`. The fold bucket always takes the last slot.
 */
const PREFERRED_SLOT: Readonly<Record<string, number>> = {
  desktop: 0,
  mobile: 1,
  tablet: 2,
  Windows: 0,
  Android: 1,
  iOS: 2,
  macOS: 1,
  Linux: 0,
  ChromeOS: 2,
  Other: 2,
};

/**
 * One colour per label, stable by entity rather than by rank.
 *
 * A label's slot is its entry above, or a hash of its name for anything
 * unlisted. Three hues cannot give seven operating systems a colour each, so
 * when two labels in one chart want the same slot, one moves to the next free
 * slot. Collisions are settled in alphabetical order, never rank order, so
 * the same set of labels always gets the same colours however it is sorted.
 */
export function sliceColours(
  labels: readonly string[],
  palette: readonly string[],
): string[] {
  const size = palette.length;
  if (size === 0) return labels.map(() => '');
  const out: string[] = labels.map(() => '');
  const taken = new Set<number>();
  const order = labels
    .map((label, i) => ({ label, i }))
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  for (const { label, i } of order) {
    let slot = PREFERRED_SLOT[label];
    if (slot === undefined) {
      let hash = 0;
      for (const ch of label) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
      slot = hash;
    }
    slot %= size;
    for (let tries = 0; tries < size && taken.has(slot); tries++) {
      slot = (slot + 1) % size;
    }
    taken.add(slot);
    out[i] = palette[slot];
  }
  return out;
}

/**
 * A funnel bar's width, floored at 2% and capped at 100.
 *
 * The floor matters: a real-but-tiny step must still render as a mark rather
 * than vanish, or "one person reached the contact section" and "nobody did"
 * look identical.
 */
export function bandWidth(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.max(2, (part / whole) * 100));
}
