/**
 * Reassembling an event stream that the network cut wherever it liked.
 *
 * A chunk boundary falls at an arbitrary byte, so every one of these is a
 * real shape the reader will see: a frame split across two reads, two frames
 * in one read, a `data:` line that is not valid JSON, and a body that ends
 * without a terminal frame. Getting any of them wrong loses part of an
 * answer, and losing part of an answer is invisible in a diff.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paceChars, parseFrames, readChatStream } from '@/lib/chat/stream-client';

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function bodyOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) return controller.close();
      controller.enqueue(encoder.encode(chunks[i]));
      i += 1;
    },
  });
}

const collect = async (chunks: string[], firstTokenMs = 1000) => {
  const seen: string[] = [];
  const outcome = await readChatStream(bodyOf(chunks), (t) => seen.push(t), {
    firstTokenMs,
    abort: () => {},
  });
  return { text: seen.join(''), outcome };
};

test('a frame split across two reads is not lost', () => {
  const whole = frame('delta', { text: 'Alex ' });
  const cut = Math.floor(whole.length / 2);
  const first = parseFrames(whole.slice(0, cut));
  assert.deepEqual(first.frames, [], 'half a frame yields nothing');
  const second = parseFrames(first.rest + whole.slice(cut));
  assert.equal(second.frames.length, 1);
  assert.deepEqual(second.frames[0], { event: 'delta', data: { text: 'Alex ' } });
});

test('several frames in one read all come through, in order', () => {
  const buffer = frame('delta', { text: 'a ' }) + frame('delta', { text: 'b ' }) + frame('done', { answer: 'a b' });
  const { frames, rest } = parseFrames(buffer);
  assert.equal(rest, '');
  assert.deepEqual(frames.map((f) => f.event), ['delta', 'delta', 'done']);
});

test('an unreadable frame is skipped, not fatal', () => {
  const buffer = 'event: delta\ndata: {not json\n\n' + frame('delta', { text: 'ok' });
  const { frames } = parseFrames(buffer);
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0].data, { text: 'ok' });
});

test('a multi-byte character straddling a chunk survives', async () => {
  // Devanagari makes this the common case, not the exotic one: the answer is
  // three bytes per character and the boundary lands mid-character often.
  const text = 'मयूर ने Northwind में';
  const whole = frame('delta', { text }) + frame('done', { answer: text });
  const bytes = new TextEncoder().encode(whole);
  const cut = 20; // deliberately inside a character
  const halves = [bytes.slice(0, cut), bytes.slice(cut)];
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= halves.length) return controller.close();
      controller.enqueue(halves[i]);
      i += 1;
    },
  });
  const seen: string[] = [];
  const outcome = await readChatStream(body, (t) => seen.push(t), { firstTokenMs: 1000, abort: () => {} });
  assert.equal(seen.join(''), text);
  assert.equal(outcome?.kind, 'done');
});

test('the terminal frame is returned, and says which kind it was', async () => {
  const done = await collect([frame('delta', { text: 'hi' }), frame('done', { answer: 'hi', source: 'AI' })]);
  assert.equal(done.outcome?.kind, 'done');
  assert.deepEqual(done.outcome?.payload, { answer: 'hi', source: 'AI' });

  const fell = await collect([frame('delta', { text: 'part' }), frame('fallback', { answer: 'approved' })]);
  assert.equal(fell.outcome?.kind, 'fallback');
  // The deltas still fired; the caller is what replaces them.
  assert.equal(fell.text, 'part');
});

test('a body that ends without a terminal frame returns null', async () => {
  const { outcome, text } = await collect([frame('delta', { text: 'half an answer' })]);
  assert.equal(outcome, null, 'null is what sends the caller to the offline answer');
  assert.equal(text, 'half an answer');
});

test('an empty delta does not count as the first token', async () => {
  // Otherwise a keep-alive would disarm the watchdog and a stream that never
  // says anything would hang until the total ceiling instead of falling back.
  const { text, outcome } = await collect([frame('delta', { text: '' }), frame('fallback', { answer: 'x' })]);
  assert.equal(text, '');
  assert.equal(outcome?.kind, 'fallback');
});

test('the pacer always drains, and never stalls', () => {
  assert.equal(paceChars(0), 0);
  // A buffer of nine would never empty on a fixed one-tenth.
  assert.equal(paceChars(1), 1);
  assert.equal(paceChars(9), 1);
  assert.equal(paceChars(300), 30);
  // Bigger buffers take bigger bites, so the text never falls behind the
  // model no matter how fast it writes.
  assert.ok(paceChars(600) > paceChars(300));

  // The property that matters: a full answer empties in a readable number
  // of frames, and the loop always terminates.
  let pending = 600;
  let frames = 0;
  while (pending > 0 && frames < 1000) {
    pending -= paceChars(pending);
    frames += 1;
  }
  assert.equal(pending, 0, 'the buffer empties');
  assert.ok(frames > 20 && frames < 120, `drained in ${frames} frames, which should read as writing`);
});
