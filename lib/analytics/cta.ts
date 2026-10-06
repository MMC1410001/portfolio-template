/**
 * CTA impressions, was the control ever actually seen?
 *
 * The gap this fills: the clicks table is a numerator with no denominator. A
 * CTA with 12 clicks might have been shown to 20 people and be excellent, or
 * shown to 2,000 and be invisible, and those are indistinguishable from clicks
 * alone. A button nobody clicks and a button nobody reaches look the same.
 *
 * ── What counts as seen ────────────────────────────────────────────────────
 * Half the element on screen for a full second. Not first intersection: a
 * fling to the footer crosses every CTA on the way and would report each as
 * seen, inflating the denominator and making every CTA look worse than it is, 
 * failing in the direction that causes wrong decisions.
 *
 * Lumen's ANALYTICS.md records that its `src/` contained **zero**
 * `data-af-tag` attributes, so its CTA funnel was permanently empty. Avoiding
 * that repeat is the whole point of the tag pass in Portfolio.tsx.
 */

import { queueEvent } from './queue';
import { isUntrackedPath, trackingSuppressed } from './scope';
import { normaliseTag } from './normalise';
import { currentSection } from './sections';
import { currentMode } from './mode';
import { debouncedScan } from './dom';

/**
 * What this watches.
 *
 * `[data-track-tag]` is already the authoritative name for an element in
 * clicks.ts, so anything named for the clicks table gets an impression for
 * free with no second attribute to remember. `[data-track-cta]` is for
 * something worth an impression that has no click name of its own, the two
 * nested `level:'block'` sections use it.
 */
const WATCHED = '[data-track-tag], [data-track-cta]';

const VISIBLE_RATIO = 0.5;
const DWELL_MS = 1000;
/** How long to coalesce DOM mutations before re-scanning, as in sections.ts. */
const SCAN_DEBOUNCE_MS = 250;

let observer: IntersectionObserver | null = null;
let scanner: MutationObserver | null = null;
let seen = new Set<string>();
/** Pending "has it held for a second yet" timers, keyed by element. */
const pending = new Map<Element, ReturnType<typeof setTimeout>>();

function nameOf(el: Element): string | null {
  return (
    normaliseTag(el.getAttribute('data-track-tag')) ??
    normaliseTag(el.getAttribute('data-track-cta'))
  );
}

function report(el: Element): void {
  const tag = nameOf(el);
  if (!tag || seen.has(tag)) return;
  if (isUntrackedPath(window.location.pathname)) return;

  seen.add(tag);
  queueEvent('cta_view', {
    props: { tag, section: currentSection(), mode: currentMode() },
  });
}

function onIntersect(entries: IntersectionObserverEntry[]): void {
  for (const entry of entries) {
    const el = entry.target;
    const held = pending.get(el);

    if (entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO) {
      if (held === undefined) {
        pending.set(
          el,
          setTimeout(() => {
            pending.delete(el);
            report(el);
          }, DWELL_MS),
        );
      }
      continue;
    }

    // Left before the second was up: scrolled past, not read.
    if (held !== undefined) {
      clearTimeout(held);
      pending.delete(el);
    }
  }
}

function scan(): void {
  if (!observer) return;
  for (const el of Array.from(document.querySelectorAll(WATCHED))) {
    // observe() is idempotent per element, so re-observing is a no-op rather
    // than a double count.
    observer.observe(el);
  }
}

/**
 * Re-scan after mutations, debounced, and only for ones that added an element.
 *
 * The undebounced version ran a document-wide querySelectorAll on every
 * mutation batch, once per scroll frame while the turntable turned. See
 * debouncedScan() in dom.ts for the filter.
 */
const scans = debouncedScan(SCAN_DEBOUNCE_MS, scan);

/**
 * Install the observers. Idempotent.
 *
 * The MutationObserver earns its place here even without lazy routes: the chat
 * panel's contents mount only when the Sheet opens, and ImmersiveSystem mounts
 * lazily on reveal. A one-off querySelectorAll at install time would miss every
 * tag inside both.
 *
 * Not installed where nothing would be recorded. /admin re-renders its panels
 * constantly, so a document-wide MutationObserver there scanned for
 * impressions that queueEvent() was always going to refuse.
 * `syncAnalyticsRoute()` installs it on the next navigation that can record.
 */
export function installCtaVisibility(): void {
  if (observer || typeof window === 'undefined') return;
  if (typeof IntersectionObserver !== 'function') return;
  if (trackingSuppressed()) return;

  observer = new IntersectionObserver(onIntersect, {
    threshold: [0, VISIBLE_RATIO, 1],
  });

  scan();

  if (typeof MutationObserver === 'function') {
    scanner = new MutationObserver(scans.schedule);
    scanner.observe(document.body, { childList: true, subtree: true });
  }
}

/**
 * Start the impressions over, for a new page.
 *
 * `seen` is per page, so the footer seen on `/`, then again after a round
 * trip through `/dashboards`, is two impressions in two views. The dashboard
 * counts distinct sessions, so that cannot inflate a CTA's reach. The pending
 * timers belong to nodes that are gone.
 */
export function resetCtaViews(): void {
  seen = new Set();
  for (const timer of pending.values()) clearTimeout(timer);
  pending.clear();
  observer?.disconnect();
  scan();
}

/** Take the observers down, for a route where nothing is recorded. */
export function uninstallCtaVisibility(): void {
  observer?.disconnect();
  scanner?.disconnect();
  observer = null;
  scanner = null;
  scans.cancel();
  for (const timer of pending.values()) clearTimeout(timer);
  pending.clear();
}

/** Test seam. Not for application code. */
export function __resetCtaVisibility(): void {
  uninstallCtaVisibility();
  seen = new Set();
}
