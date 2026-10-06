/**
 * The batched event queue, the only thing in the app that writes an event.
 *
 * Why a queue: a click-level system fires far too many events to send one at a
 * time. Batching keeps a whole session to a handful of requests.
 *
 * Three flush triggers, in order of how often they fire:
 *   - size,  MAX_BATCH reached, so a burst of clicks never sits in memory
 *   - timer, FLUSH_INTERVAL_MS, so a quiet page still reports
 *   - exit,  pagehide / visibilitychange, the only chance to record duration
 *
 * The exit flush uses navigator.sendBeacon, because a normal fetch is cancelled
 * when the page goes away. The body is a `text/plain` Blob: that content type
 * is CORS-safelisted so it needs no preflight, which matters because a beacon
 * fired during pagehide has no time for a round trip. `/api/track` reads it
 * as byte-capped text (`lib/read-capped.ts`) + `JSON.parse`, exactly as
 * `/api/chat` does, never `request.json()`, which is content-type sensitive.
 */

import type { AnalyticsEvent, QueuedEvent } from './events';
import { ensureSessionId, TRACK_ENDPOINT } from './session';
import { trackingSuppressed } from './scope';
import { normalisePath } from './normalise';

const MAX_BATCH = 20;
const FLUSH_INTERVAL_MS = 10_000;
/** Hard ceiling so a runaway loop cannot grow the queue without bound. */
const MAX_QUEUED = 200;

const SESSION_START_KEY = 'pfSessionStart';

/**
 * How recently the tail must have been queued for enrichLastEvent() to name it.
 *
 * A gesture and the click that caused it are one dispatch apart, the capture
 * listener and the React handler run in the same task, so a few milliseconds.
 * Without a bound, a trackTag() from a scroll handler relabelled whatever click
 * happened to be last in the queue, seconds or minutes earlier.
 */
const ENRICH_WINDOW_MS = 50;

let queue: QueuedEvent[] = [];
/**
 * When the tail was queued. Module memory rather than a field on the event,
 * because every field on QueuedEvent is sent to the server. Stays valid across
 * a partial drain: flushEvents() takes from the front, never the tail.
 */
let tailQueuedAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let hooksInstalled = false;
/** See QueuedEvent.seq. Never reset outside the test seam. */
let seqCounter = 0;
/** An exit was recorded for the current hidden period. See installFlushHooks. */
let exitRecorded = false;

/**
 * Contributors to the final `session_end` row.
 *
 * A callback list rather than direct imports, and that is structural: sections.ts,
 * mode.ts and scroll.ts all import queueEvent from here, so this module cannot
 * import back from them without a cycle. Each hook may queue its own events
 * first, sections.ts emits the terminal dwell row this way,  and returns props
 * to merge onto session_end. They run BEFORE session_end is queued, which is
 * what guarantees the terminal row lands ahead of it.
 */
type ExitHook = () => Record<string, unknown> | void;
const exitHooks: ExitHook[] = [];

export function onSessionExit(hook: ExitHook): void {
  if (!exitHooks.includes(hook)) exitHooks.push(hook);
}

function disabled(): boolean {
  return trackingSuppressed();
}

/** Session start, persisted so a duration survives a reload within the tab. */
function sessionStartedAt(): number {
  try {
    const stored = sessionStorage.getItem(SESSION_START_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed)) return parsed;
    }
    const now = Date.now();
    sessionStorage.setItem(SESSION_START_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

/**
 * Drop the persisted session start, with the queue, for the /privacy
 * opt-out. The next session measures its duration from its own first event,
 * not from one the visitor asked to have forgotten. It does not end
 * recording for the page: opting back in has to work without a reload.
 */
export function forgetSessionClock(): void {
  queue = [];
  try {
    sessionStorage.removeItem(SESSION_START_KEY);
  } catch {
    /* private mode. Nothing was stored to begin with */
  }
}

/** Milliseconds since this session's first tracked event. */
export function sessionDurationMs(): number {
  return Math.max(0, Date.now() - sessionStartedAt());
}

function scheduleFlush(): void {
  if (timer !== null) return;
  timer = setTimeout(() => {
    timer = null;
    void flushEvents();
  }, FLUSH_INTERVAL_MS);
}

/**
 * Add one event to the queue. Never throws, never awaits.
 *
 * Not deduped: the log is append-only and a repeat is signal, not noise.
 */
export function queueEvent(
  event: AnalyticsEvent,
  extra: Partial<Omit<QueuedEvent, 'event'>> = {},
): void {
  if (disabled()) return;

  try {
    sessionStartedAt(); // start the clock on the session's first event

    queue.push({
      event,
      path: normalisePath(window.location.pathname),
      referrer: document.referrer || null,
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
      ...extra,
      // After the spread, not before: `path` is deliberately overridable by the
      // caller and this deliberately is not.
      seq: seqCounter++,
    });
    tailQueuedAt = Date.now();

    // Drop the oldest rather than the newest: recent behaviour is what anyone
    // reading the dashboard is actually looking at.
    if (queue.length > MAX_QUEUED) queue = queue.slice(-MAX_QUEUED);

    if (queue.length >= MAX_BATCH) void flushEvents();
    else scheduleFlush();
  } catch {
    /* sessionStorage or window unavailable, not worth an error */
  }
}

/**
 * Attach extra props to the most recently queued event.
 *
 * Needed far less here than in the source system, because there is no GTM: the
 * name is in the DOM, so the capture-phase listener reads it on the first pass
 * and the row is named immediately. What is left for this is programmatic
 * gestures that are not DOM clicks, a Select changing value, a quality switch
 * via trackTag() in tag.ts.
 *
 * Guarded on the event type so a stray call cannot rewrite an unrelated row.
 * This guard is also the reason for the queue-order rule documented in
 * clicks.ts: `rage_click` must be queued before the `click` row, never after.
 *
 * And guarded on time: only a tail queued within ENRICH_WINDOW_MS counts as the
 * same gesture. An older click is somebody else's row, and the caller writes
 * its own instead.
 */
export function enrichLastEvent(
  event: AnalyticsEvent,
  props: Record<string, unknown>,
): boolean {
  const last = queue[queue.length - 1];
  if (!last || last.event !== event) return false;
  if (Date.now() - tailQueuedAt > ENRICH_WINDOW_MS) return false;
  last.props = { ...last.props, ...props };
  return true;
}

/**
 * Send everything queued. Resolves when the request has been handed off, not
 * when it lands, because no caller waits on analytics.
 */
export async function flushEvents(beacon = false): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  // Checked at send time as well as at queue time. Opting out on /privacy with
  // events already queued must not send them: the visitor asked before they
  // left the browser, and that is the moment that counts.
  if (disabled()) {
    queue = [];
    return;
  }
  if (queue.length === 0) return;

  let session_id: string;
  try {
    session_id = ensureSessionId();
  } catch {
    queue = [];
    return;
  }

  if (beacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    // Loop rather than send one batch: this is the page's last chance to send
    // anything, and MAX_QUEUED is 200. A single-batch version would silently
    // drop everything past the first 20 with nothing left to retry from.
    while (queue.length > 0) {
      const batch = queue.slice(0, MAX_BATCH);
      const blob = new Blob([JSON.stringify({ session_id, events: batch })], {
        type: 'text/plain;charset=UTF-8',
      });
      if (navigator.sendBeacon(TRACK_ENDPOINT, blob)) {
        queue.splice(0, batch.length);
        continue;
      }
      // Refused (the browser's ~64 KB beacon budget). Unlike the source
      // system, try once more with keepalive rather than giving up: the batch
      // here is smaller and the retry is free. session_end is the row this
      // exists to save, and it is the last one queued.
      void fetch(TRACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id, events: batch }),
        keepalive: true,
      }).catch(() => {});
      queue.splice(0, batch.length);
    }
    return;
  }

  // Take the batch out before sending. A failed send is dropped rather than
  // retried: a retry queue that survives a failing endpoint turns one broken
  // deploy into an ever-growing request loop.
  const events = queue.splice(0, MAX_BATCH);

  try {
    await fetch(TRACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id, events }),
    });
  } catch {
    /* offline, blocked by an extension, or not deployed, all expected */
  }

  // A burst larger than one batch keeps draining.
  if (queue.length > 0) scheduleFlush();
}

/**
 * Register the page-exit flush. Idempotent.
 *
 * Both events are needed: pagehide is the reliable one on desktop, and iOS
 * Safari frequently never fires it, visibilitychange is the only signal there.
 * The session_end row is what turns a pile of timestamps into a duration.
 */
export function installFlushHooks(): void {
  if (hooksInstalled || typeof window === 'undefined') return;
  hooksInstalled = true;

  /**
   * Suppression is checked HERE, at fire time, not at install time.
   *
   * install.ts calls this once from a mount effect with no deps, so a bail-out
   * here would never be retried. In the source system a tab whose first load
   * was /admin "registered no exit listeners at all" and then recorded page
   * views and clicks but never a session_end, dropping the queued tail.
   */
  const finalise = () => {
    if (disabled()) return;
    // One exit per hidden period. On desktop, closing a tab fires both
    // visibilitychange and pagehide, and the second used to queue a second
    // session_end; every tab switch then produced its own pair. Anything
    // queued since the first is still beaconed.
    if (exitRecorded) {
      void flushEvents(true);
      return;
    }
    exitRecorded = true;

    let props: Record<string, unknown> = {};
    for (const hook of exitHooks) {
      try {
        const contributed = hook();
        if (contributed) props = { ...props, ...contributed };
      } catch {
        /* one bad contributor must not cost the whole session_end row */
      }
    }

    queueEvent('session_end', { duration_ms: sessionDurationMs(), props });
    void flushEvents(true);
  };

  /**
   * A hide is kept as an exit, not dropped, because on iOS it is frequently
   * the only one there is. Coming back re-arms it: the visitor who returns
   * and then leaves exits a second time, and the later terminal row is the
   * one that describes it (see flushSectionDwell() in sections.ts).
   */
  window.addEventListener('pagehide', finalise);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') finalise();
    else exitRecorded = false;
  });
  // A back/forward-cache restore is the page coming back without a reload.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) exitRecorded = false;
  });
}

/** Test seam. Not for application code. */
export function __resetQueue(): void {
  queue = [];
  tailQueuedAt = 0;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  hooksInstalled = false;
  seqCounter = 0;
  exitRecorded = false;
  exitHooks.length = 0;
}

/** Test seam. Not for application code. */
export function __peekQueue(): readonly QueuedEvent[] {
  return queue;
}
