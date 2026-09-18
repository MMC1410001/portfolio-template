/**
 * Section engagement, the replacement for page views on a one-route site.
 *
 * The whole site is `/`. "Which page did they leave from" has no meaning here,
 * so the unit of engagement becomes the in-page section, and `path` on a
 * page_view row becomes `'/#work'` rather than a real route.
 *
 * ── The dwell convention is INVERTED from the source system ────────────────
 * Lumen emits a page_view on *entering* a path, carrying the dwell on the
 * *previous* one, and its SQL pulls it forward with
 * `lead(duration_ms) over (order by created_at)`. That works, but its own
 * ANALYTICS.md states the cost: "the last page of a session has no dwell
 * measurement."
 *
 * On a single-page site the last section is the most interesting one. It is
 * where the visitor stopped, so losing its dwell loses the answer. Emitting on
 * **leave** fixes it for free:
 *   - duration_ms belongs to the row that names it, so avg dwell is a plain
 *     `AVG(duration_ms) GROUP BY path`, no window function
 *   - flushSectionDwell() emits the terminal row on exit, so every section
 *     entry produces exactly one row with a real dwell
 *   - the exit section is `props.terminal`, not `row_number() … DESC`, which is
 *     robust to a beacon batch arriving out of order
 *   - props.from / props.to give the full section-transition graph
 *
 * ── Why `level` exists ─────────────────────────────────────────────────────
 * `#northwind-erp` and `#additional-projects` are nested INSIDE `<section
 * id="work">`. A flat observer over all eleven would hold `work` and
 * `northwind-erp` simultaneously active and their dwells would sum to more than
 * the session. So only `level:'section'` drives the dwell machine (one active
 * at a time); the two nested blocks are watched by the CTA observer instead and
 * produce `cta_view` rows ("this block was genuinely seen") which answers the
 * question that actually matters about them (did anyone reach the ERP study)
 * without overlapping any dwell.
 */

import { queueEvent, onSessionExit } from './queue';
import { isUntrackedPath } from './scope';
import { currentMode } from './mode';
import {
  DWELL_SECTIONS,
  SECTIONS,
  SECTION_IDS,
  sectionLabel,
  type TrackedSection,
} from './section-catalogue';

// Re-exported so callers that only want the catalogue need one import, and
// so the admin panel never reaches into a module that installs observers.
export { SECTIONS, SECTION_IDS, sectionLabel };
export type { TrackedSection };

/**
 * A section held for less than this emits no row at all.
 *
 * A momentum scroll to the footer must not claim eight section views.
 */
const MIN_DWELL_MS = 800;

/**
 * Trailing debounce before a change is committed.
 *
 * A fling past five sections emits nothing for four of them.
 */
const ENTER_SETTLE_MS = 600;

/**
 * A 20%-of-viewport band across the middle. Whichever section occupies the band
 * is active.
 *
 * Lumen's scroll-spy uses `-15% 0px -70%`: correct for highlighting a
 * sidebar item, where the top of the viewport is what the reader is looking at.
 * For *dwell* the centre is right, because a section taller than the viewport
 * should own the whole time it fills the screen. `#work` is three viewports
 * tall here, so this matters.
 */
const ROOT_MARGIN = '-40% 0px -40% 0px';

/** How long to coalesce DOM mutations before re-scanning for sections. */
const SCAN_DEBOUNCE_MS = 250;

let observer: IntersectionObserver | null = null;
let scanner: MutationObserver | null = null;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let registered = false;

/** The section currently being dwelt on, and when it became active. */
let active: string | null = null;
let activeSince = 0;
/** The one before it, for props.from. */
let previous: string | null = null;
/** Which ids are intersecting the band right now. */
const intersecting = new Set<string>();

function docHeight(): number {
  const doc = document.documentElement;
  return Math.round(Math.max(doc.scrollHeight, window.innerHeight, 1));
}

/** The section currently active, for props.section on other event types. */
export function currentSection(): string | null {
  return active;
}

/**
 * Whichever intersecting section is highest in document order.
 *
 * Lumen's pickActiveEntry names the bug this avoids: setting the active id
 * for every intersecting entry means the last one in the entry list wins, 
 * which is the *lower* section, not the one being read.
 */
function pickActive(): string | null {
  for (const section of DWELL_SECTIONS) {
    if (intersecting.has(section.id)) return section.id;
  }
  return null;
}

/** Emit the dwell row for the section being left. */
function emitLeave(
  leaving: string,
  enteredAt: number,
  entering: string | null,
  terminal: boolean,
): void {
  const dwell = Date.now() - enteredAt;
  if (dwell < MIN_DWELL_MS) return;

  queueEvent('page_view', {
    path: `/#${leaving}`,
    duration_ms: dwell,
    props: {
      from: previous,
      to: entering,
      mode: currentMode(),
      doc_h: docHeight(),
      ...(terminal ? { terminal: true } : {}),
    },
  });
}

function commit(): void {
  const next = pickActive();
  if (next === active) return;

  if (active !== null) {
    emitLeave(active, activeSince, next, false);
    previous = active;
  }

  active = next;
  activeSince = Date.now();
}

function onIntersect(entries: IntersectionObserverEntry[]): void {
  for (const entry of entries) {
    const id = entry.target.id;
    if (!id) continue;
    if (entry.isIntersecting) intersecting.add(id);
    else intersecting.delete(id);
  }

  if (settleTimer !== null) clearTimeout(settleTimer);
  settleTimer = setTimeout(commit, ENTER_SETTLE_MS);
}

/**
 * Emit the final dwell row. Called from the session-exit hook, before
 * session_end is queued.
 *
 * This is the row the source system could not produce, and on a one-page site
 * it is the one worth having.
 */
export function flushSectionDwell(): void {
  if (active === null) return;
  emitLeave(active, activeSince, null, true);
  // Cleared so a pagehide followed by a visibilitychange cannot emit twice.
  previous = active;
  active = null;
}

/** Attach to every section that exists yet. True once they all do. */
function observeAll(): boolean {
  if (!observer) return false;
  let all = true;
  for (const section of DWELL_SECTIONS) {
    const el = document.getElementById(section.id);
    // observe() is idempotent per element, so re-observing is a no-op.
    if (el) observer.observe(el);
    else all = false;
  }
  return all;
}

/**
 * Re-scan after DOM changes, debounced, and stop once there is nothing left
 * to find.
 *
 * The undebounced version ran DWELL_SECTIONS.length getElementById calls on
 * every mutation batch in the whole document, every chat message rendered,
 * every mode transition, to compute an answer that stops changing a few
 * hundred milliseconds after load. Cheap individually, and pure waste for the
 * rest of the session.
 */
function scheduleScan(): void {
  if (scanTimer !== null) return;
  scanTimer = setTimeout(() => {
    scanTimer = null;
    if (observeAll() && scanner) {
      scanner.disconnect();
      scanner = null;
    }
  }, SCAN_DEBOUNCE_MS);
}

/**
 * Re-adopt a section after a tab switch.
 *
 * finalise() in queue.ts fires on `visibilitychange -> hidden`, which runs the
 * exit hooks, which call flushSectionDwell() and clear `active`. But a tab
 * switch is not an unload. When the visitor comes back no IntersectionObserver
 * entry changes (`intersecting` never moved) so commit() is never called
 * again and `active` stays null for the rest of the session. Every later
 * click, scroll milestone and dwell row would be filed with `section: null`
 * until the visitor happened to scroll into a different section.
 *
 * The clock restarts rather than resuming: time spent looking at another tab
 * is not dwell on this one.
 */
function onVisibility(): void {
  if (document.visibilityState !== 'visible') return;
  if (active !== null) return;
  active = pickActive();
  activeSince = Date.now();
}

/** Install the dwell machine. Idempotent. */
export function installSectionTracking(): void {
  if (observer || typeof window === 'undefined') return;
  if (typeof IntersectionObserver !== 'function') return;
  if (isUntrackedPath(window.location.pathname)) return;

  observer = new IntersectionObserver(onIntersect, {
    rootMargin: ROOT_MARGIN,
    threshold: 0,
  });

  observeAll();

  // The hero is on screen at load, and IntersectionObserver does fire an
  // initial callback, but ImmersiveSystem and the chat panel mount later, and
  // a `<details>` opening changes the document height. Watching for added
  // nodes keeps the observer attached to sections that arrive with a chunk.
  if (typeof MutationObserver === 'function') {
    scanner = new MutationObserver(scheduleScan);
    scanner.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('visibilitychange', onVisibility);

  if (!registered) {
    registered = true;
    onSessionExit(() => {
      const exit = active;
      flushSectionDwell();
      return { exit_section: exit };
    });
  }
}

/** Test seam. Not for application code. */
export function __resetSectionTracking(): void {
  observer?.disconnect();
  scanner?.disconnect();
  observer = null;
  scanner = null;
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibility);
  }
  if (settleTimer !== null) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
  if (scanTimer !== null) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }
  active = null;
  previous = null;
  activeSince = 0;
  intersecting.clear();
  registered = false;
}
