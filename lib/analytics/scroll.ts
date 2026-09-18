/**
 * Scroll depth, how far down the page people actually get.
 *
 * On a single scrolling page this is the site's bounce curve. The section dwell
 * machine gives per-section resolution; this gives the one-number-per-session
 * version, which is what a KPI tile can show.
 *
 * Milestones rather than a continuous value because the question is "did they
 * reach the certifications", which a bucket answers and a mean does not. The
 * set is deliberately unchanged from the source system, adding 10/90 would
 * break the dashboard's fixed d25/d50/d75/d100 columns for no new information.
 */

import { queueEvent, onSessionExit } from './queue';
import { isUntrackedPath } from './scope';
import { currentSection } from './sections';
import { currentMode } from './mode';

/**
 * 100 means the bottom of the document is on screen, not that the scroll
 * offset reached the document height, which is unreachable, since the last
 * viewport of a page cannot be scrolled past.
 */
const MILESTONES = [25, 50, 75, 100] as const;

/**
 * How long a depth must hold before it counts.
 *
 * A momentum fling on a phone passes through every milestone on the way to the
 * footer, and counting those would report that everyone read everything.
 * Debounced on the trailing edge so only where the page came to rest counts.
 */
const SETTLE_MS = 400;

let installed = false;
let registered = false;
let reached = new Set<number>();
let timer: ReturnType<typeof setTimeout> | null = null;
/** The deepest point reached all session, for the session_end row. */
let maxScrollPx = 0;
let maxDocH = 0;

function docHeight(): number {
  const doc = document.documentElement;
  return Math.max(doc.scrollHeight, window.innerHeight, 1);
}

/** Depth of the deepest point currently visible, as a whole percentage. */
function currentDepth(): number {
  const seen = (window.scrollY || 0) + window.innerHeight;
  return Math.min(100, Math.round((seen / docHeight()) * 100));
}

/**
 * The deepest pixel reached and the height it was measured against.
 *
 * The single best engagement metric on a one-page site, and the reason it is
 * reported as a pair: 6,000px of a 9,000px page and 6,000px of a 15,000px page
 * are not the same reading session, and the height changes mid-session when a
 * `<details>` opens.
 */
export function maxScrollReached(): { max_scroll_px: number; doc_h: number } {
  return { max_scroll_px: Math.round(maxScrollPx), doc_h: Math.round(maxDocH) };
}

function record(): void {
  if (isUntrackedPath(window.location.pathname)) return;

  const height = docHeight();
  const seen = (window.scrollY || 0) + window.innerHeight;
  if (seen > maxScrollPx) maxScrollPx = seen;
  if (height > maxDocH) maxDocH = height;

  const depth = currentDepth();
  const section = currentSection();
  const mode = currentMode();

  for (const milestone of MILESTONES) {
    if (depth < milestone || reached.has(milestone)) continue;
    reached.add(milestone);
    queueEvent('scroll_depth', {
      props: {
        depth: milestone,
        // The page height this depth was a percentage of. Same reason the
        // click point carries doc_h: "50%" is not comparable between a
        // 9,000px page and a 15,000px one.
        doc_h: Math.round(height),
        // So a row can be read as "50% is roughly the certifications".
        section,
        mode,
      },
    });
  }
}

function onScroll(): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(record, SETTLE_MS);
}

/**
 * Install the listeners. Idempotent.
 *
 * passive: true because this handler never calls preventDefault, and a
 * non-passive scroll listener blocks the compositor on every frame. resize is
 * included because rotating a phone changes both the viewport and the document
 * height, so the same scroll offset becomes a different depth.
 */
export function installScrollTracking(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  if (!registered) {
    registered = true;
    onSessionExit(() => maxScrollReached());
  }

  // The initial measurement. A page whose content fits the viewport is 100%
  // seen the moment it renders; waiting for a scroll event that never comes
  // would report nothing at all, which reads identically to "nobody scrolled"
  // when in fact everybody saw all of it.
  onScroll();
}

export function resetScrollDepth(): void {
  reached = new Set();
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (installed) onScroll();
}

/** Test seam. Not for application code. */
export function __resetScrollTracking(): void {
  if (installed && typeof window !== 'undefined') {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  }
  installed = false;
  registered = false;
  maxScrollPx = 0;
  maxDocH = 0;
  resetScrollDepth();
}
