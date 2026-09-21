'use client';
/**
 * The chat's idle clock, read the way React wants external state read.
 *
 * The policy is in `lib/chat/session.ts`, which is pure and unit-tested. This
 * file is the part that cannot be: a `setTimeout`, a `visibilitychange`
 * listener, and a `useSyncExternalStore` over one boolean. The split is the
 * same one `hooks/use-speech.ts` and `lib/chat/speech-text.ts` already make.
 *
 * ── Why a store and not a `useEffect` with a timer ────────────────────────
 * `react/react-compiler` is set to error in this repo and rejects `setState`
 * inside an effect, and `Date.now()` anywhere lexically inside a component
 * body. Both are unavoidable for an idle timer, so both live here instead.
 *
 * ── Why the expiry is read twice, in two different ways ───────────────────
 * `useSessionExpired()` is the *render* path: it is what puts the "this
 * conversation timed out" line in the log while the visitor is looking at it.
 *
 * `sessionLapsed()` is the *handler* path, called by `send()`. It cannot rely
 * on the flag alone, because the timer is throttled in a background tab and
 * may not have fired yet when the visitor comes back and immediately types.
 * So it re-checks the clock directly. Trusting only the flag is how a
 * three-hour-old pronoun ends up in the prompt.
 */
import { useSyncExternalStore } from 'react';
import { hasLapsed, IDLE_MS } from '@/lib/chat/session';

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

let lastActivityAt = 0;
let expired = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let visibilityBound = false;

function expire(): void {
  if (expired) return;
  expired = true;
  notify();
}

function arm(): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    // A timer can fire early only if the system clock moved backwards, in
    // which case re-arming for the remainder is the right answer rather than
    // ending a conversation that is thirty seconds old.
    if (!hasLapsed(lastActivityAt, Date.now())) {
      arm();
      return;
    }
    expire();
  }, IDLE_MS);
}

/**
 * Something happened: a question, an answer, a Listen press, a panel opening.
 *
 * Called from event handlers only. Restarts the clock, and un-ends a session
 * that had already ended, since the visitor is evidently back.
 */
export function touchSession(): void {
  lastActivityAt = Date.now();
  if (expired) {
    expired = false;
    notify();
  }
  arm();
}

/**
 * True if the conversation has gone quiet past the limit.
 *
 * For handlers. Checks the clock as well as the flag: see the note above.
 */
export function sessionLapsed(): boolean {
  return expired || hasLapsed(lastActivityAt, Date.now());
}

/** For render. Only true once the clock has actually run out. */
export function useSessionExpired(): boolean {
  return useSyncExternalStore(subscribe, () => expired, () => false);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!visibilityBound && typeof document !== 'undefined') {
    visibilityBound = true;
    // Background tabs have their timers throttled, so a tab left open over
    // lunch can come back with the timeout still pending. Returning to the
    // tab is the moment the visitor would notice the stale thread, so check
    // then rather than waiting for a timer that is running late.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && hasLapsed(lastActivityAt, Date.now())) expire();
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam, and the reset a panel would need if one were ever remounted. */
export function resetSession(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  lastActivityAt = 0;
  expired = false;
}
