/**
 * Reading the `/api/chat` event stream, without the DOM.
 *
 * ── Why the timeout changes shape when the reply streams ──────────────────
 * The panel's 8.5s abort was a total budget, and it was the right one while
 * a reply arrived all at once: nothing had been shown, so cutting it off
 * cost the visitor nothing they could see. Once words appear, killing the
 * connection at 8.5s would delete a half-read sentence off the screen, which
 * is worse than the wait it avoids.
 *
 * So the deadline moves to the FIRST token. Nothing within `firstTokenMs`
 * means the model is not coming and the curated answer is served, exactly as
 * before. After the first token the visitor is reading, and the only limit
 * left is a ceiling on a stream that never ends.
 *
 * ── Why this is a separate file with no imports ───────────────────────────
 * Same rule as `speech-text.ts`, `session.ts` and `language.ts`: it is
 * unit-tested in a bare Node process, so no DOM and no React. `parseFrames`
 * is where the real risk lives — a network chunk can split an SSE frame
 * anywhere, including mid-word and mid-JSON — and it is pure.
 */

export type ChatFrame =
  | { event: 'delta'; data: { text: string } }
  | { event: 'done'; data: Record<string, unknown> }
  | { event: 'fallback'; data: Record<string, unknown> };

/**
 * Split whatever has arrived into whole frames, and return the remainder.
 *
 * A chunk boundary falls wherever the network put it, so the tail is almost
 * never a complete frame. Returning it rather than parsing it is the whole
 * job; dropping it loses a word, and parsing it throws.
 */
export function parseFrames(buffer: string): { frames: ChatFrame[]; rest: string } {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  const frames: ChatFrame[] = [];
  for (const part of parts) {
    let event = '';
    let data = '';
    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!event || !data) continue;
    try {
      const parsed: unknown = JSON.parse(data);
      if (parsed && typeof parsed === 'object') {
        frames.push({ event, data: parsed } as ChatFrame);
      }
    } catch {
      // A frame we cannot read is skipped rather than fatal: the `done` or
      // `fallback` frame still decides what the visitor ends up with.
    }
  }
  return { frames, rest };
}

/**
 * Deltas are a callback because they happen many times; the terminal frame
 * is a return value because it happens once. Making it a callback too cost
 * nothing at runtime and made the result invisible to the type checker,
 * which narrowed the caller's variable to `never` — a fair complaint about
 * the shape rather than a quirk to cast away.
 */
export interface StreamOutcome {
  /** 'done' is the model's reply; 'fallback' is approved text replacing it. */
  kind: 'done' | 'fallback';
  payload: ChatPayload;
}

/**
 * The terminal frame's payload, checked rather than cast.
 *
 * Structurally the `Answer` of content/faq.ts, redeclared because this file
 * imports nothing. The panel used to take the frame's JSON `as unknown as
 * Answer`, so a frame without an `answer` string reached `.slice()` and
 * threw inside the success path, leaving the panel stuck busy.
 */
export interface ChatPayload {
  answer: string;
  source: string;
  mode: 'faq' | 'ai';
  href?: string;
  ids?: string[];
  /** The server's signature over the reply, sent back with it as history. lib/chat/turn-sig.ts. */
  sig?: string;
}

/** A payload the panel can render, or null, which sends it to the offline answer. */
export function toPayload(data: Record<string, unknown>): ChatPayload | null {
  if (typeof data.answer !== 'string' || typeof data.source !== 'string') return null;
  const payload: ChatPayload = { answer: data.answer, source: data.source, mode: data.mode === 'ai' ? 'ai' : 'faq' };
  if (typeof data.href === 'string') payload.href = data.href;
  if (Array.isArray(data.ids)) payload.ids = data.ids.filter((id): id is string => typeof id === 'string');
  if (typeof data.sig === 'string') payload.sig = data.sig;
  return payload;
}

/**
 * Drive `handlers` from a response body, enforcing the first-token deadline.
 *
 * Returns the terminal frame, or null. Null means the caller should fall
 * back, and covers every failure the same way: no first token in time, a
 * body that ends without a terminal frame, a terminal frame with no answer
 * text in it, a network drop mid-answer.
 */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
  options: { firstTokenMs: number; abort: () => void },
): Promise<StreamOutcome | null> {
  // Decoded by hand rather than with TextDecoderStream: the DOM lib and the
  // Workers types disagree on that stream's chunk parameter, and this file
  // is compiled for both plus a bare Node test process. `stream: true` is
  // the load-bearing part — a multi-byte character can straddle a chunk, and
  // Devanagari makes that the common case rather than the exotic one.
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawFirst = false;
  let outcome: StreamOutcome | null = null;

  const watchdog = setTimeout(() => {
    if (!sawFirst) options.abort();
  }, options.firstTokenMs);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { frames, rest } = parseFrames(buffer);
      buffer = rest;
      for (const frame of frames) {
        if (frame.event === 'delta') {
          if (typeof frame.data.text !== 'string' || !frame.data.text) continue;
          sawFirst = true;
          clearTimeout(watchdog);
          onDelta(frame.data.text);
        } else if (frame.event === 'done' || frame.event === 'fallback') {
          // The last terminal frame decides, and one that cannot be rendered
          // decides "offline" rather than being skipped for an earlier one.
          const payload = toPayload(frame.data);
          outcome = payload ? { kind: frame.event, payload } : null;
        }
      }
    }
  } catch {
    // An aborted read is the watchdog firing, or the visitor pressing stop.
  } finally {
    clearTimeout(watchdog);
  }
  return outcome;
}

/**
 * How many characters to reveal on this animation frame.
 *
 * Tokens do not arrive at a readable rate: they come in bursts, several per
 * network read, and React batches those setStates into one tick, so a whole
 * clause appears in a single frame and then nothing happens for half a
 * second. Releasing a slice per frame turns that into something that reads
 * like writing rather than like pasting.
 *
 * A fraction of what is waiting, not a fixed rate, which makes it
 * self-balancing: a buffer that is filling faster than it drains takes
 * bigger bites and never falls behind the model, and a nearly empty one
 * trickles. Always at least one character, or a buffer of nine would never
 * empty.
 */
const PACE_DIVISOR = 10;

export function paceChars(pending: number): number {
  if (pending <= 0) return 0;
  return Math.max(1, Math.ceil(pending / PACE_DIVISOR));
}
