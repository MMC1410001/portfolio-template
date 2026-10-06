/**
 * One question to `/api/chat`, and what the panel should show for it, without
 * React or the DOM.
 *
 * ── Why this is its own file ───────────────────────────────────────────────
 * This used to be the body of `send()` in components/portfolio/Chat.tsx: the
 * fetch, two deadlines, the allowance headers, the 429s, the stream and the
 * offline answer, interleaved with nineteen state setters. Chat.tsx cannot be
 * imported by a bare Node process, so the only way to test any of it was a
 * regex over the source text, which proves a line exists and not that it
 * runs. Here the transport is a function of its inputs: `fetch`, the timers
 * and the callbacks are parameters, and tests/ask.test.ts drives every path
 * with a fake clock. Chat.tsx keeps the state and the transcript.
 *
 * ── Every path ends in an answer ───────────────────────────────────────────
 * `ask()` never throws. Three ways to stop (the header ceiling, the
 * first-token watchdog, and the visitor pressing stop) land in the same catch
 * and are meant to: an abandoned question still gets the curated answer
 * rather than leaving the panel stuck busy. The reason on the signal is what
 * labels it.
 */
import { answerQuestion, GUARD_SOURCES, type Answer } from '@/content/faq';
import { classifyFailure, type ChatFailure } from '@/lib/analytics/chat';
import { DAILY_LIMIT_CODE, QUOTA_HEADERS, UNLIMITED, readQuota, serialiseQuota } from './quota';
import { readChatStream, toPayload } from './stream-client';

/**
 * How long the panel waits for the response HEADERS, not for the answer. The
 * JSON path sends no headers until the whole reply is composed, so for it this
 * is the whole budget, and lib/chat/nim.ts's TOTAL_BUDGET_MS is held under it
 * (tests/chat-contracts.test.ts). The streaming path sends headers at once and
 * is then held to FIRST_TOKEN_MS. Without this ceiling that watchdog was the
 * only clock, and it starts only once headers arrive, so a Worker that
 * accepted the connection and never answered left the panel waiting with no
 * deadline at all.
 */
export const HEADER_CEILING_MS = 8500;

/**
 * 12s, where the headers had 8.5s, and the increase is the point of streaming
 * rather than a regression of it. Measured time-to-first-token varies 3.3s to
 * 19s, and this is a ceiling before giving up, not a typical wait: the
 * thinking line says "still working on it" from SLOW_AFTER_MS, and the moment
 * a token lands the visitor is reading rather than waiting. Passing it costs
 * them the curated answer they would have had at 8.5s anyway. The deadline is
 * on the FIRST token, not the whole reply: once words are on screen, cutting
 * the connection would delete a half-read sentence. See stream-client.ts.
 */
export const FIRST_TOKEN_MS = 12000;

/**
 * A model reply is written, not looked up, and takes seconds. Saying so after
 * four of them is the difference between a wait and a hang.
 */
export const SLOW_AFTER_MS = 4000;

/**
 * The source label on a curated answer served because the server did not give
 * one. A refused request is not an offline one, and saying "Offline" when the
 * visitor is plainly online teaches them the label means nothing. The answer
 * served is the same curated text either way; only the reason differs, and the
 * reason is the part worth being honest about. 'timed_out' is either clock
 * giving up, the header ceiling or the first-token watchdog: the Worker was
 * reachable and simply did not answer in time.
 */
export const FALLBACK_SOURCES = {
  stopped: 'Stopped · from the portfolio',
  timed_out: 'Timed out · from the portfolio',
  rate_limited: 'Rate limited · from the portfolio',
  offline: 'Offline · from the portfolio',
} as const;

/** Shown beside a per-minute refusal, which is not the daily allowance. */
export const RATE_NOTICE =
  'That is faster than the guide can answer. Give it about a minute — these replies still come from the portfolio.';

/**
 * The daily allowance, not an outage: nothing is answered, offline or
 * otherwise, and the panel closes its input. See QUOTA_KEY in Chat.tsx.
 */
export const DAILY_LIMIT_ANSWER: Answer = {
  answer:
    'That is today’s limit of questions for this guide. The chat reopens once the 24 hours are up, and Alex is happy to answer anything else directly.',
  mode: 'faq',
  source: 'Daily limit reached',
};

/** One prior turn, as the panel keeps it and the server checks it (lib/chat/turn-sig.ts). */
export interface HistoryTurn {
  role: 'user' | 'assistant';
  text: string;
  sig?: string;
}

export interface AskRequest {
  question: string;
  history: HistoryTurn[];
  carried: string[];
  /** Owned by the caller so its Stop button can `abort('user')`. */
  controller: AbortController;
}

export interface AskHandlers {
  /** The allowance to store: UNLIMITED, or a serialised Quota. */
  onQuota(stored: string): void;
  /** SLOW_AFTER_MS passed with no first token. */
  onSlow(): void;
  /** One streamed piece of the reply. The first one ends the wait. */
  onDelta(text: string): void;
}

/** What `ask()` touches outside itself, so a test can stand in for each. */
export interface AskDeps {
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

/**
 * Arrow wrappers, not the globals themselves: `deps.fetch(...)` would call
 * fetch with `this` bound to this object, which browsers refuse.
 */
const browserDeps: AskDeps = {
  fetch: (input, init) => fetch(input, init),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (id) => clearTimeout(id as Parameters<typeof clearTimeout>[0]),
};

export type AskKind = 'answered' | 'streamed' | 'daily_limit' | keyof typeof FALLBACK_SOURCES;

export interface AskOutcome {
  kind: AskKind;
  /** What to render, with the source already labelled. */
  answer: Answer;
  /** A guard answered it, so neither the question nor the reply joins the history. */
  guarded: boolean;
  /** Answered in the browser; such a reply carries no signature. */
  offline: boolean;
  failure: ChatFailure;
  /** The HTTP status of a refused request, otherwise undefined. */
  status?: number;
  /** A line for the panel beside the answer. */
  notice?: string;
}

const served = (kind: 'answered' | 'streamed', answer: Answer): AskOutcome => ({
  kind,
  answer,
  guarded: GUARD_SOURCES.includes(answer.source),
  offline: false,
  failure: null,
});

/** The curated answer for a request that did not produce one, labelled with why. */
function fallback(question: string, error: unknown, reason: unknown, status: number | undefined, limited: boolean): AskOutcome {
  if (limited) return { kind: 'daily_limit', answer: { ...DAILY_LIMIT_ANSWER }, guarded: true, offline: false, failure: null, status };
  const local = answerQuestion(question);
  const kind: keyof typeof FALLBACK_SOURCES =
    reason === 'user' ? 'stopped' : reason === 'slow' ? 'timed_out' : status === 429 ? 'rate_limited' : 'offline';
  return {
    kind,
    // `guarded` is read from the curated source, before the relabel replaces it.
    answer: { ...local, source: FALLBACK_SOURCES[kind] },
    guarded: GUARD_SOURCES.includes(local.source),
    offline: true,
    failure: kind === 'timed_out' ? 'timeout' : classifyFailure(error),
    status,
    ...(kind === 'rate_limited' ? { notice: RATE_NOTICE } : {}),
  };
}

/**
 * Ask one question. Resolves once the reply is complete, with what to render;
 * streamed pieces arrive through `handlers.onDelta` before that.
 */
export async function ask(request: AskRequest, handlers: AskHandlers, deps: AskDeps = browserDeps): Promise<AskOutcome> {
  const { question, history, carried, controller } = request;
  let status: number | undefined;
  let limited = false;
  const slowTimer = deps.setTimeout(() => handlers.onSlow(), SLOW_AFTER_MS);
  const headerTimer = deps.setTimeout(() => controller.abort('slow'), HEADER_CEILING_MS);
  try {
    const response = await deps.fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ message: question, history, carried, stream: true }),
      signal: controller.signal,
    });
    deps.clearTimeout(headerTimer);
    const reported = readQuota(response.headers);
    if (response.headers.get(QUOTA_HEADERS.unlimited) === '1') handlers.onQuota(UNLIMITED);
    else if (reported) handlers.onQuota(serialiseQuota(reported));
    if (!response.ok) {
      status = response.status;
      if (status === 429) {
        const refusal = (await response.json().catch(() => null)) as { code?: string; limit?: number; resetAt?: number } | null;
        if (refusal?.code === DAILY_LIMIT_CODE) {
          limited = true;
          // An old Worker, or no database: the body still says when it reopens.
          if (!reported && typeof refusal.limit === 'number' && typeof refusal.resetAt === 'number') {
            handlers.onQuota(serialiseQuota({ limit: refusal.limit, remaining: 0, resetAt: refusal.resetAt }));
          }
        }
      }
      throw new Error('status');
    }
    if (response.headers.get('content-type')?.includes('text/event-stream') && response.body) {
      const outcome = await readChatStream(
        response.body,
        (text) => {
          deps.clearTimeout(slowTimer);
          handlers.onDelta(text);
        },
        { firstTokenMs: FIRST_TOKEN_MS, abort: () => controller.abort('slow') },
      );
      // No terminal frame: nothing started in time, or the connection died.
      // 'fallback' frames are not this: that is approved text the server chose,
      // and readChatStream has already checked it has text to show.
      if (!outcome) throw new Error('stream');
      return served('streamed', outcome.payload);
    }
    // Checked, not cast: a 200 whose body is not an answer (a proxy's error
    // page, a truncated body) used to reach `.slice()` and throw in the success
    // path. Anything toPayload() refuses takes the curated answer.
    const data: unknown = await response.json();
    const payload = data && typeof data === 'object' ? toPayload(data as Record<string, unknown>) : null;
    if (!payload) throw new Error('payload');
    return served('answered', payload);
  } catch (error) {
    deps.clearTimeout(headerTimer);
    return fallback(question, error, controller.signal.reason, status, limited);
  } finally {
    deps.clearTimeout(slowTimer);
  }
}
