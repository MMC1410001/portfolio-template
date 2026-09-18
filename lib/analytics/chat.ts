/**
 * Chatbot instrumentation, a panel the source system has no equivalent for.
 *
 * ── Why capture is client-side ─────────────────────────────────────────────
 * Chat.tsx runs `answerQuestion()` in the browser on any failure and labels the
 * source 'Offline · from the portfolio'. A server-only capture would undercount
 * exactly the case most worth knowing about, by construction. The client also
 * knows things the server cannot: whether the panel was opened and abandoned,
 * whether a suggestion chip or the typed input produced the question, and
 * latency as the visitor experienced it including the full 8.5s timeout.
 *
 * One writer is one rule. `/api/chat` logs only a coarse backend-health counter
 * with no question text, in its own table, rendered in its own card, so
 * nothing double-counts.
 *
 * ── The one source that is not an answer ───────────────────────────────────
 * Chat.tsx seeds the conversation with `source: 'Answers from the portfolio'`,
 * which is NOT one of content/faq.ts's real sources. The panel must exclude it
 * or the source distribution gains a phantom bucket equal to the number of
 * sessions that opened the panel.
 */

import { queueEvent } from './queue';
import { normaliseQuestion, type QuestionRejection } from './normalise';
import { currentSection } from './sections';
import { currentMode } from './mode';

/** The greeting's pseudo-source. Never a real answer; excluded everywhere. */
export const SEED_SOURCE = 'Answers from the portfolio';

/** How a `/api/chat` call failed, when it did. */
export type ChatFailure = 'timeout' | 'status' | 'network' | null;

/**
 * Classify a thrown value from the fetch in Chat.tsx.
 *
 * Chat.tsx's original `catch {}` discarded the reason entirely, which made "the
 * backend is slow" and "the backend is down" the same number, and only one of
 * them is fixed by raising the timeout.
 */
export function classifyFailure(error: unknown): ChatFailure {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return 'timeout';
  }
  if (error instanceof Error && error.message === 'status') return 'status';
  return 'network';
}

/**
 * Returns the open timestamp for trackChatClose to measure against.
 *
 * The clock lives here rather than in Chat.tsx deliberately: oxlint's
 * react/react-compiler Purity rule rejects `Date.now()` anywhere lexically
 * inside a component body, it cannot prove a nested function is only ever
 * called from an event handler. Owning the clock in the module satisfies the
 * rule and is the better separation regardless.
 */
export function trackChatOpen(trigger: 'launcher' | 'suggestion'): number {
  queueEvent('chat_open', {
    props: { trigger, section: currentSection(), mode: currentMode() },
  });
  return Date.now();
}

/**
 * Queued the instant send() starts, before the await.
 *
 * Deliberately before the network call: a question asked in the last moments
 * before a tab closes is still recorded, and the pagehide beacon carries it.
 */
export function trackChatAsk(
  raw: string,
  promptIndex: number | null,
  turn: number,
): { q: string | null; rejected: QuestionRejection; startedAt: number } {
  const { q, rejected } = normaliseQuestion(raw);
  queueEvent('chat_ask', {
    props: {
      // null when the PII/URL/length screen refused the text. The event still
      // fires, rejecting the words must never reject the measurement.
      q,
      q_len: raw.length,
      rejected,
      prompt_index: promptIndex,
      turn,
      section: currentSection(),
      mode: currentMode(),
    },
  });
  return { q, rejected, startedAt: performance.now() };
}

export function trackChatAnswer(opts: {
  source: string;
  mode: 'faq' | 'ai';
  offline: boolean;
  failure: ChatFailure;
  status?: number;
  startedAt: number;
  hasHref: boolean;
  answerLen: number;
  turn: number;
}): void {
  queueEvent('chat_answer', {
    props: {
      source: opts.source,
      answer_mode: opts.mode,
      offline: opts.offline,
      failure: opts.failure,
      status: opts.status ?? null,
      latency_ms: Math.round(performance.now() - opts.startedAt),
      has_href: opts.hasHref,
      answer_len: opts.answerLen,
      turn: opts.turn,
      section: currentSection(),
      mode: currentMode(),
    },
  });
}

/**
 * The abandoned-panel signal.
 *
 * `asked === 0` with a long `dwell_ms` is someone who read the greeting and
 * gave up; `asked === 0` with a 2s dwell is a mis-tap. Derivable from a
 * chat_open with no chat_ask, but carrying it on one row makes it a single
 * query and captures the dwell that tells the two apart.
 */
export function trackChatClose(opts: {
  asked: number;
  answered: number;
  openedAt: number;
  lastSource: string | null;
}): void {
  queueEvent('chat_close', {
    props: {
      asked: opts.asked,
      answered: opts.answered,
      dwell_ms: Math.max(0, Date.now() - opts.openedAt),
      last_source:
        opts.lastSource === SEED_SOURCE ? null : opts.lastSource,
      section: currentSection(),
      mode: currentMode(),
    },
  });
}
