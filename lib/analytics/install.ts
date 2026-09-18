/**
 * One entry point, called once from a client component in app/layout.tsx.
 *
 * The order below is load-bearing and mirrors the source system's split
 * between `main.tsx` (attribution, before render) and `RouteTracker`
 * (listeners, on mount):
 *
 *   1. captureAttribution  reads and cleans the URL before anything else can
 *                          observe it, and mints the visitor id
 *   2. installFlushHooks   registers the exit listeners unconditionally, 
 *                          suppression is re-checked at FIRE time, not here
 *   3. installModeTracking registers the session_end contributor
 *   4. trackVisit          the immediate row that establishes the session
 *   5. the observers       clicks, scroll, sections, CTA
 *
 * Step 2 must not bail early. Lumen's comment on that is the load-bearing
 * one: a tab whose first load was /admin "registered no exit listeners at all"
 * and then recorded page views and clicks but never a session_end.
 *
 * Every installer is idempotent, so a remount is harmless.
 */

import { captureAttribution } from './utm';
import { installFlushHooks } from './queue';
import { installModeTracking } from './mode';
import { trackVisit } from './session';
import { installClickTracking } from './clicks';
import { installScrollTracking } from './scroll';
import { installSectionTracking } from './sections';
import { installCtaVisibility } from './cta';

let installed = false;

/**
 * `reduced` comes from the caller because Portfolio.tsx already resolves
 * `prefers-reduced-motion` and two independent matchMedia reads could
 * disagree. It rides the `visit` row as a session property.
 */
export function installAnalytics(reduced = false): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  try {
    captureAttribution();
    installFlushHooks();
    installModeTracking();
    trackVisit(reduced);
    installClickTracking();
    installScrollTracking();
    installSectionTracking();
    installCtaVisibility();
  } catch {
    /* one failed installer must not take the page down */
  }
}

/** Test seam. Not for application code. */
export function __resetInstall(): void {
  installed = false;
}
