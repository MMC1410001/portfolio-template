/**
 * What the recorders do when the page changes under them.
 *
 * install.ts runs once per document. That was the whole story while the site
 * was one route, and stopped being it when `/dashboards`, `/analytics` and
 * `/privacy` became next/link destinations: a client-side navigation keeps the
 * document, the module state and every listener, and replaces the page. So
 * `AnalyticsProvider` calls this on every pathname change, and the opt-out on
 * /privacy calls it when the switch flips. It does two things.
 *
 *   1. **Per-page state starts over.** The section being read is closed and
 *      the observer re-pointed at the new nodes; scroll milestones, the
 *      deepest point and its height, CTA impressions and the dead/rage caps
 *      all reset, because each describes one page.
 *   2. **Listeners exist only where something can be recorded.** Where
 *      trackingSuppressed() is true (/admin, the heatmap frame, an opted-out
 *      browser) every row would be refused at queue time, so the click,
 *      scroll, section and CTA listeners are taken down, and put back on the
 *      next page that can record. The exit hooks in queue.ts are NOT touched:
 *      they check suppression when they fire, and a tab whose first page was
 *      /admin must still end its session properly (see install.ts).
 *
 * A plain module rather than a hook so `node --test` can import it; the
 * modules it drives are the ones tests/dom-stub.ts can run.
 */
import { trackingSuppressed } from '@/lib/analytics/scope';
import {
  installClickTracking,
  resetPageInteractions,
  uninstallClickTracking,
} from '@/lib/analytics/clicks';
import {
  installScrollTracking,
  resetScrollDepth,
  uninstallScrollTracking,
} from '@/lib/analytics/scroll';
import {
  installSectionTracking,
  resetSectionTracking,
  uninstallSectionTracking,
} from '@/lib/analytics/sections';
import {
  installCtaVisibility,
  resetCtaViews,
  uninstallCtaVisibility,
} from '@/lib/analytics/cta';
import { forgetSessionClock } from '@/lib/analytics/queue';
import { forgetSessionId, trackVisit } from '@/lib/analytics/session';
import { forgetAttribution } from '@/lib/analytics/utm';

/** The pathname last synced. Null until the first call, which is the landing. */
let lastPath: string | null = null;

/**
 * Bring the recorders in line with the current page.
 *
 * The first call only records the landing path: install.ts has just set
 * everything up for it. `restart` forces the per-page reset on the same path,
 * for measurement being turned back on mid-page.
 */
export function syncAnalyticsRoute(pathname: string, restart = false): void {
  if (typeof window === 'undefined') return;
  try {
    const changed = restart || (lastPath !== null && lastPath !== pathname);
    lastPath = pathname;

    if (trackingSuppressed()) {
      uninstallClickTracking();
      uninstallScrollTracking();
      uninstallSectionTracking();
      uninstallCtaVisibility();
      return;
    }

    if (changed) {
      resetSectionTracking();
      resetScrollDepth();
      resetCtaViews();
      resetPageInteractions();
    }
    // Idempotent, so on an ordinary navigation these are no-ops; after a
    // suppressed page they are what brings recording back.
    installClickTracking();
    installScrollTracking();
    installSectionTracking();
    installCtaVisibility();
  } catch {
    /* instrumentation must never break a navigation */
  }
}

/**
 * Everything that links one visit to the next, gone: the browser id, the
 * tab's session id and start time, and the tab's campaign. For the opt-out.
 */
export function forgetAnalyticsIdentity(): void {
  forgetSessionClock();
  forgetSessionId();
  forgetAttribution();
}

/**
 * Measurement was turned back on without a reload: start a new session the
 * way a page load would, with its own `visit` row, and the page from scratch.
 *
 * `reduced` is read here, not passed, because this runs from a click handler
 * and there is no Portfolio.tsx value to share on /privacy.
 */
export function restartAnalytics(pathname: string): void {
  syncAnalyticsRoute(pathname, true);
  const reduced =
    typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  trackVisit(reduced);
}

/** Test seam. Not for application code. */
export function __resetAnalyticsRoute(): void {
  lastPath = null;
}
