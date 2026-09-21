/**
 * When a conversation stops being a conversation.
 *
 * ── Why this is a separate file with no imports ───────────────────────────
 * Same rule as `lib/chat/speech-text.ts`: it is unit-tested, and
 * `npm run test:units` imports it in a bare Node process through the resolver
 * hook in `tests/ts-hooks.mjs`. No DOM, no `window`, no React. The wiring to
 * `setTimeout` and `useSyncExternalStore` lives in `hooks/use-idle.ts`.
 *
 * ── What "session" means here, and what it does not ───────────────────────
 * Nothing is stored on the server; `/api/chat` is stateless and the client is
 * what remembers (`historyRef` and `carriedRef` in `Chat.tsx`). So a session
 * ending is not a logout, a cookie, or a request. It is exactly two things:
 *
 *   - the conversation context is dropped, so the next question is read on its
 *     own rather than as a follow-up to something asked before lunch;
 *   - the visitor is told, in the transcript, that it happened.
 *
 * The second half is the point. Silently forgetting is worse than not
 * remembering at all: a visitor who asks "and what about the second one?"
 * after a long pause gets a confused answer with no explanation, and the only
 * thing they learn is that the bot is unreliable.
 */

/** Ten minutes of no question, no reply and no Listen press. */
export const IDLE_MS = 10 * 60 * 1000;

/**
 * How many messages the transcript keeps.
 *
 * The panel lives as long as the tab does and nothing ever removed a message,
 * so a long session grew the DOM and the retained answer strings without
 * bound. Forty is roughly twenty exchanges, far past any real visit, and well
 * under the point where scrolling the log gets expensive.
 */
export const MAX_TRANSCRIPT = 40;

/**
 * Has the conversation gone quiet for long enough to end?
 *
 * `lastActivityAt` of 0 means nothing has happened yet, which is not a lapse.
 * The clock is passed in rather than read, because oxlint's
 * `react/react-compiler` Purity rule rejects `Date.now()` anywhere lexically
 * inside a component body. `lib/analytics/chat.ts` owns the clock for the same
 * reason.
 */
export function hasLapsed(lastActivityAt: number, now: number): boolean {
  if (!lastActivityAt) return false;
  return now - lastActivityAt >= IDLE_MS;
}

/**
 * The transcript, capped, with the greeting kept.
 *
 * The first message is the only one that says what the panel is and what it
 * answers from, so it survives; everything else is dropped oldest-first.
 */
export function trimTranscript<T>(messages: readonly T[], limit: number = MAX_TRANSCRIPT): T[] {
  if (limit < 1) return [];
  if (messages.length <= limit) return [...messages];
  return [messages[0], ...messages.slice(messages.length - (limit - 1))];
}

/**
 * A transcript key that survives trimming.
 *
 * Messages used to be keyed by array index, and the Listen button used the
 * same index to say which reply was being spoken. Both break the moment the
 * list can lose its head: React reuses a row it should have replaced, and the
 * speaking highlight lands on whichever answer inherited the old index. A
 * monotonic counter is never reused.
 *
 * It lives here, in a module, rather than in a ref inside `Chat.tsx`, so that
 * the mutation is not something `react-compiler` has to reason about.
 */
let seq = 0;

export function nextKey(): number {
  seq += 1;
  return seq;
}

/** Test seam. Never called by the app; the counter only ever goes up there. */
export function resetKeys(): void {
  seq = 0;
}
