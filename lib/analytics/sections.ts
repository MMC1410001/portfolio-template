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
import { trackingSuppressed } from './scope';
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
/**
 * The element each id is observed through.
 *
 * Keyed by id because the id is the stable thing and the node is not: a
 * client-side navigation away from `/` and back renders a fresh `<section
 * id="work">`, and an observer still holding the detached one reports nothing
 * for the rest of the session.
 */
const observed = new Map<string, Element>();

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
 *
 * ── A tab switch is a provisional exit ─────────────────────────────────────
 * The hook runs on `visibilitychange -> hidden` as well as on pagehide,
 * because iOS Safari frequently never fires pagehide and a hide is the only
 * exit it reports. So a hide ends the current view with `terminal: true`, and
 * if the visitor comes back, onVisibility() opens a new one. Each visible span
 * is one row and at most one of them is terminal per hide; queue.ts latches
 * finalise() so the pagehide that follows a hide on desktop cannot add a
 * second. A session with several tab switches therefore has several terminal
 * rows, and **the last one is the exit**: the dashboard counts only that one.
 *
 * The row that resumes after a hide carries `from` equal to its own section,
 * which no ordinary transition can produce (commit() only fires on a change),
 * so a query can tell a continuation from a fresh view of the section.
 */
export function flushSectionDwell(): void {
  if (active === null) return;
  emitLeave(active, activeSince, null, true);
  // Cleared so a pagehide followed by a visibilitychange cannot emit twice,
  // and `previous` set so the resumed row reads as a continuation.
  previous = active;
  active = null;
}

/**
 * Point the observer at the section nodes that are in the document now.
 *
 * Compares node identity rather than asking "is this id observed": after a
 * client-side navigation back to `/` the ids are the same and every node is
 * new. A swapped or removed node is unobserved and dropped from `intersecting`
 * (an unobserved target reports no final entry), and the settle timer is
 * re-armed so the active section is re-picked from what is really there.
 */
function observeAll(): void {
  if (!observer) return;
  let changed = false;
  for (const section of DWELL_SECTIONS) {
    const el = document.getElementById(section.id);
    const held = observed.get(section.id);
    if (el === held) continue;
    changed = true;
    if (held) {
      observer.unobserve(held);
      intersecting.delete(section.id);
    }
    if (el) {
      observer.observe(el);
      observed.set(section.id, el);
    } else {
      observed.delete(section.id);
    }
  }
  if (!changed) return;
  if (settleTimer !== null) clearTimeout(settleTimer);
  settleTimer = setTimeout(commit, ENTER_SETTLE_MS);
}

/**
 * Re-scan after DOM changes, debounced, and only for ones that added an element.
 *
 * It used to disconnect itself once every section had been found, which was
 * right for a one-route site and wrong once `/dashboards` shipped: a
 * next/link round trip replaces every section node, and with the scanner gone
 * nothing re-attached them, so the rest of the session had no page_view and
 * `section: null` on every row. It stays alive now, and pays for it with the
 * same filter cta.ts uses: the turntable rewrites a text node on every scroll
 * frame, and no section can arrive in a Text node.
 */
function scheduleScan(records: MutationRecord[]): void {
  if (scanTimer !== null) return;
  const added = records.some((r) =>
    Array.from(r.addedNodes).some((n) => n.nodeType === 1),
  );
  if (!added) return;
  scanTimer = setTimeout(() => {
    scanTimer = null;
    observeAll();
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
 * is not dwell on this one. `pageshow` covers a restore from the back/forward
 * cache, which is the same situation reached by another road.
 */
function onVisibility(): void {
  if (document.visibilityState !== 'visible') return;
  if (active !== null) return;
  active = pickActive();
  activeSince = Date.now();
}

function onPageShow(event: Event): void {
  if ((event as PageTransitionEvent).persisted) onVisibility();
}

/**
 * Install the dwell machine. Idempotent.
 *
 * Bails when recording is suppressed (/admin, the heatmap frame, an opted-out
 * browser): every row it could produce would be refused by queueEvent()
 * anyway, so the observers would be pure cost. `syncAnalyticsRoute()` calls
 * this again on each navigation, so a tab that opened on /admin still gets it
 * on the way to `/`.
 */
export function installSectionTracking(): void {
  if (observer || typeof window === 'undefined') return;
  if (typeof IntersectionObserver !== 'function') return;
  if (trackingSuppressed()) return;

  observer = new IntersectionObserver(onIntersect, {
    rootMargin: ROOT_MARGIN,
    threshold: 0,
  });

  observeAll();

  // The hero is on screen at load, and IntersectionObserver does fire an
  // initial callback, but ImmersiveSystem and the chat panel mount later, a
  // `<details>` opening changes the document height, and a navigation back to
  // `/` renders every section again. Watching for added elements keeps the
  // observer attached to whichever nodes are current.
  if (typeof MutationObserver === 'function') {
    scanner = new MutationObserver(scheduleScan);
    scanner.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);

  if (!registered) {
    registered = true;
    onSessionExit(() => {
      const exit = active;
      flushSectionDwell();
      return { exit_section: exit };
    });
  }
}

/** Forget the view in progress: the observers, timers and every held node. */
function clearView(): void {
  if (settleTimer !== null) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
  if (scanTimer !== null) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }
  for (const el of observed.values()) observer?.unobserve(el);
  observed.clear();
  intersecting.clear();
  active = null;
  previous = null;
  activeSince = 0;
}

/**
 * A client-side navigation happened. Close the section being read and start
 * over on whatever the new route renders.
 *
 * The row for the section being left is emitted here rather than left to the
 * observer, because a node removed from the document may or may not report a
 * last entry depending on the browser, and a view must not end on a guess. It
 * is not terminal: the session is still going. `to` is null, as for any
 * section left for somewhere that has no sections, and `previous` is reset so
 * the first row on the next page does not claim a transition across routes.
 *
 * By the time this runs the pathname is already the new one, so leaving `/`
 * for /admin loses that last row to trackingSuppressed(). That is our own
 * traffic, and the only case it happens in.
 */
export function resetSectionTracking(): void {
  if (active !== null) emitLeave(active, activeSince, null, false);
  clearView();
  observeAll();
}

/** Take the machine down entirely, for a route where nothing is recorded. */
export function uninstallSectionTracking(): void {
  clearView();
  observer?.disconnect();
  scanner?.disconnect();
  observer = null;
  scanner = null;
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibility);
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('pageshow', onPageShow);
  }
}

/** Test seam. Not for application code. */
export function __resetSectionTracking(): void {
  uninstallSectionTracking();
  registered = false;
}
