/**
 * Résumé <-> immersive, treated as a dimension rather than a footnote.
 *
 * Mode is genuinely a second page. From app/globals.css:
 * `.immersive .resume-title, .immersive .resume-aside { display:none }`,
 * `.immersive .immersive-title { display:inline }`,
 * `.immersive .system-stage { display:block; position:absolute }`,
 * `.immersive .hero { grid-template-columns: 1fr 1fr }`,
 * `.immersive .project-visual { display:block; height:245px }`.
 *
 * So every click, scroll milestone and section dwell carries props.mode, and
 * the heatmap filters on it, a merged heatmap over one of the two layouts
 * would be a lie about half the clicks.
 *
 * `'transitioning'` is deliberately NOT a recorded mode. It lasts 850ms and is
 * an animation state; a third bucket would mean nothing. It maps to
 * 'immersive', because the transition is committed the moment reveal() runs.
 */

import { queueEvent, onSessionExit } from './queue';

export type PortfolioMode = 'resume' | 'immersive';
/**
 * `'timer'` is the ten-second auto-reveal. `'idle'` is the same trigger under
 * its former name, it stopped being emitted when the reveal moved from idle
 * time to time on the page, and stays in the union because rows carrying it
 * are still in the event log.
 */
export type ModeTrigger = 'timer' | 'idle' | 'manual' | 'reduced-motion' | 'preview';

let mode: PortfolioMode = 'resume';
let since = Date.now();
let resumeMs = 0;
let immersiveMs = 0;
let changes = 0;
let registered = false;

/** Fold the elapsed time into whichever bucket we have been sitting in. */
function settle(now: number): number {
  const elapsed = Math.max(0, now - since);
  if (mode === 'immersive') immersiveMs += elapsed;
  else resumeMs += elapsed;
  since = now;
  return elapsed;
}

/**
 * Called from Portfolio.tsx when the settled mode changes.
 *
 * `trigger` is passed explicitly rather than inferred, and it is the whole
 * point of the feature: reveal() is called from three places, the header's
 * `.mode-control` button, the hero's `.reveal-link`, and the reveal timer
 * reaching zero. Only the third answers "does the 10-second auto-reveal work,
 * or does it fire after everyone has already left?"
 */
export function recordModeChange(
  to: PortfolioMode,
  trigger: ModeTrigger,
  extra: Record<string, unknown> = {},
): void {
  if (to === mode) return;

  const from = mode;
  const dwell = settle(Date.now());
  mode = to;
  changes += 1;

  queueEvent('mode_change', {
    props: { from, to, trigger, dwell_ms: dwell, ...extra },
  });
}

/** Current settled mode. Read by clicks.ts, scroll.ts and sections.ts. */
export function currentMode(): PortfolioMode {
  return mode;
}

/**
 * Per-mode totals for the session_end row.
 *
 * `mode_changes === 0` with `immersive_ms > 0` is the interesting shape: the
 * auto-reveal fired and they never came back.
 */
export function modeTotals(): {
  resume_ms: number;
  immersive_ms: number;
  mode_changes: number;
} {
  settle(Date.now());
  return {
    resume_ms: Math.round(resumeMs),
    immersive_ms: Math.round(immersiveMs),
    mode_changes: changes,
  };
}

/** Contribute the totals to session_end. Idempotent. */
export function installModeTracking(): void {
  if (registered) return;
  registered = true;
  onSessionExit(() => modeTotals());
}

/** Test seam. Not for application code. */
export function __resetMode(): void {
  mode = 'resume';
  since = Date.now();
  resumeMs = 0;
  immersiveMs = 0;
  changes = 0;
  registered = false;
}
