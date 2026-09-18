/**
 * The session id, and the one immediate event.
 *
 * Everything chatty (page views, clicks, scroll, chat) goes through queue.ts
 * and is batched. This module handles the single row that cannot be batched:
 * `visit`, sent the moment the page loads, because it is what establishes the
 * session's server-observed IP, viewport, user agent and campaign block. Lose
 * it and the session exists with no context attached to it.
 *
 * Fire-and-forget throughout. Analytics must never block a render, throw into a
 * component, or put an error on a visitor's console.
 */

import { trackingSuppressed } from './scope';
import { normalisePath } from './normalise';
import { visitAttribution } from './utm';

/** The one sessionStorage key that identifies an anonymous visitor. */
const SESSION_ID_KEY = 'pfSessionId';

export const TRACK_ENDPOINT = '/api/track';

/** Returns the current session id, minting one if absent. */
export function ensureSessionId(): string {
  const existing = sessionStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;

  const sessionId = crypto.randomUUID();
  sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  return sessionId;
}

/**
 * Record the session's opening row. Never awaited, never throws.
 *
 * `reduced` is passed in rather than read here: Portfolio.tsx already resolves
 * `prefers-reduced-motion` via matchMedia on mount, and two independent reads
 * could disagree. It is a session property, so it rides the one immediate row
 * instead of being repeated on every event.
 */
export function trackVisit(reduced: boolean): void {
  try {
    if (trackingSuppressed()) return;

    const session_id = ensureSessionId();
    const attribution = visitAttribution();

    void fetch(TRACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id,
        event: 'visit',
        path: normalisePath(window.location.pathname),
        // Empty string on a direct visit; the route stores null for it.
        referrer: document.referrer || null,
        props: { reduced_motion: reduced },
        // Campaign fields AND the per-browser visitor id, on this row only.
        // Attribution describes the session, not the event, repeating it
        // would let a later row disagree with the landing one about where the
        // session came from.
        attribution: attribution ?? undefined,
      }),
      keepalive: true,
    }).catch(() => {
      /* offline, or blocked by an extension, both expected, neither fatal */
    });
  } catch {
    /* sessionStorage or crypto unavailable (private mode edge cases) */
  }
}
