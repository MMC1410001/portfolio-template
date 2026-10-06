/**
 * Every way one question to /api/chat can end, driven through lib/chat/ask.ts.
 *
 * This was the body of send() in Chat.tsx, which a bare Node process cannot
 * import, so each of these used to be a regex over its source text: proof a
 * line existed, not that it ran. Here `fetch` and the timers are stand-ins and
 * the clock only moves when a test moves it.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import {
  ask,
  DAILY_LIMIT_ANSWER,
  FALLBACK_SOURCES,
  FIRST_TOKEN_MS,
  HEADER_CEILING_MS,
  RATE_NOTICE,
  SLOW_AFTER_MS,
  type AskDeps,
  type AskOutcome,
  type AskRequest,
} from '@/lib/chat/ask';
import { answerQuestion, GUARD_SOURCES } from '@/content/faq';
import { UNLIMITED } from '@/lib/chat/quota';

/** Timers that fire only when advance() passes them. */
function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    setTimeout(run: () => void, ms: number) {
      seq += 1;
      timers.set(seq, { at: now + ms, run });
      return seq;
    },
    clearTimeout(id: unknown) {
      timers.delete(id as number);
    },
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > now) continue;
        timers.delete(id);
        timer.run();
      }
    },
    get pending() {
      return timers.size;
    },
  };
}

/** A fetch that never answers, and rejects with the abort reason, as a browser's does. */
const hanging = (): AskDeps['fetch'] => (_input, init) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const json = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) =>
  new Response(JSON.stringify(body), { status: init.status, headers: { 'content-type': 'application/json', ...init.headers } });

/** Let pending promise callbacks run; the fake clock does not need real time. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function harness(fetch: AskDeps['fetch'], question = 'What has Alex built?') {
  const clock = fakeClock();
  const calls = { quota: [] as string[], slow: 0, deltas: [] as string[], fetched: [] as { input: string; init: RequestInit }[] };
  const controller = new AbortController();
  const request: AskRequest = { question, history: [{ role: 'user', text: 'Earlier' }], carried: ['lumen'], controller };
  const running: Promise<AskOutcome> = ask(
    request,
    {
      onQuota: (stored) => calls.quota.push(stored),
      onSlow: () => (calls.slow += 1),
      onDelta: (text) => calls.deltas.push(text),
    },
    {
      fetch: (input, init) => {
        calls.fetched.push({ input, init });
        return fetch(input, init);
      },
      setTimeout: (run, ms) => clock.setTimeout(run, ms),
      clearTimeout: (id) => clock.clearTimeout(id),
    },
  );
  return { clock, calls, controller, running };
}

test('the request carries the question, the prior turns, the carried ids, and asks for a stream', async () => {
  const { calls, running } = harness(async () => json({ answer: 'A', source: 'From the portfolio', mode: 'faq' }));
  await running;
  const [{ input, init }] = calls.fetched;
  assert.equal(input, '/api/chat');
  assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, { 'Content-Type': 'application/json', Accept: 'text/event-stream' });
  assert.deepEqual(JSON.parse(init.body as string), {
    message: 'What has Alex built?',
    history: [{ role: 'user', text: 'Earlier' }],
    carried: ['lumen'],
    stream: true,
  });
});

test('a JSON answer is served as the server sent it, signature and all', async () => {
  const { clock, running } = harness(async () =>
    json({ answer: 'He built things.', source: 'From the portfolio', mode: 'faq', href: '/#work', ids: ['a', 'b'], sig: 's1' }),
  );
  const outcome = await running;
  assert.equal(outcome.kind, 'answered');
  assert.deepEqual(outcome.answer, { answer: 'He built things.', source: 'From the portfolio', mode: 'faq', href: '/#work', ids: ['a', 'b'], sig: 's1' });
  assert.equal(outcome.offline, false);
  assert.equal(outcome.failure, null);
  assert.equal(outcome.guarded, false);
  assert.equal(outcome.status, undefined);
  assert.equal(clock.pending, 0, 'both clocks are cleared once the answer is in');
});

test('a 200 whose body is not an answer gets the curated one, not a crash', async () => {
  // The JSON path used to cast the body, so a proxy's error page reached
  // `.slice()` and threw inside the success path.
  for (const body of [{ error: 'bad gateway' }, null, 'text']) {
    const { running } = harness(async () => json(body));
    const outcome = await running;
    assert.equal(outcome.kind, 'offline');
    assert.equal(outcome.answer.source, FALLBACK_SOURCES.offline);
    assert.equal(outcome.answer.answer, answerQuestion('What has Alex built?').answer);
    assert.equal(outcome.failure, 'network');
  }
});

test('the header ceiling aborts with "slow" at HEADER_CEILING_MS, and labels the answer Timed out', async () => {
  const { clock, calls, controller, running } = harness(hanging());
  clock.advance(SLOW_AFTER_MS);
  assert.equal(calls.slow, 1, 'the thinking line admits the wait at SLOW_AFTER_MS');
  clock.advance(HEADER_CEILING_MS - SLOW_AFTER_MS - 1);
  assert.equal(controller.signal.aborted, false, 'not a millisecond early');
  clock.advance(1);
  assert.equal(controller.signal.reason, 'slow');
  const outcome = await running;
  assert.equal(outcome.kind, 'timed_out');
  assert.equal(outcome.answer.source, 'Timed out · from the portfolio');
  assert.equal(outcome.failure, 'timeout');
  assert.equal(outcome.offline, true);
  assert.equal(clock.pending, 0);
});

test('the header ceiling stops once headers arrive', async () => {
  // A streamed reply sends headers at once and is then held to the looser
  // first-token watchdog; the 8.5s clock must not cut it off.
  let push: ((chunk: string) => void) | undefined;
  let end: (() => void) | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      push = (chunk) => stream.enqueue(new TextEncoder().encode(chunk));
      end = () => stream.close();
    },
  });
  const { clock, controller, running } = harness(async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
  await settle();
  push?.(sse('delta', { text: 'He ' }));
  await settle();
  clock.advance(HEADER_CEILING_MS * 2);
  assert.equal(controller.signal.aborted, false);
  push?.(sse('done', { answer: 'He built things.', source: 'AI · grounded in portfolio', mode: 'ai', sig: 's2' }));
  end?.();
  const outcome = await running;
  assert.equal(outcome.kind, 'streamed');
});

test('a streamed reply reports each piece, then settles on the terminal frame', async () => {
  const frames = [
    sse('delta', { text: 'He ' }),
    sse('delta', { text: 'built ' }),
    sse('done', { answer: 'He built things.', source: 'AI · grounded in portfolio', mode: 'ai', ids: ['x'], sig: 's3' }),
  ];
  const { clock, calls, running } = harness(async () => new Response(frames.join(''), { headers: { 'content-type': 'text/event-stream' } }));
  const outcome = await running;
  assert.deepEqual(calls.deltas, ['He ', 'built ']);
  assert.equal(outcome.kind, 'streamed');
  assert.equal(outcome.answer.answer, 'He built things.');
  assert.equal(outcome.answer.sig, 's3');
  assert.equal(outcome.offline, false);
  assert.equal(calls.slow, 0);
  assert.equal(clock.pending, 0);
});

test('a fallback frame before any token is still an answer, not a failure', async () => {
  const { running } = harness(async () =>
    new Response(sse('fallback', { answer: 'Approved text.', source: 'From the portfolio', mode: 'faq' }), {
      headers: { 'content-type': 'text/event-stream' },
    }),
  );
  const outcome = await running;
  assert.equal(outcome.kind, 'streamed');
  assert.equal(outcome.answer.answer, 'Approved text.');
});

test('a stream that ends without a terminal frame gets the curated answer', async () => {
  const { running } = harness(async () => new Response(sse('delta', { text: 'He ' }), { headers: { 'content-type': 'text/event-stream' } }));
  const outcome = await running;
  assert.equal(outcome.kind, 'offline');
  assert.equal(outcome.answer.source, FALLBACK_SOURCES.offline);
});

test('the first-token watchdog aborts with "slow" at FIRST_TOKEN_MS', async () => {
  // readChatStream owns this clock and uses the global setTimeout, so it is
  // the global one that is mocked here.
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { controller, running } = harness(async (_input, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          init.signal?.addEventListener('abort', () => stream.error(init.signal?.reason));
        },
      });
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
    });
    await settle();
    mock.timers.tick(FIRST_TOKEN_MS - 1);
    assert.equal(controller.signal.aborted, false);
    mock.timers.tick(1);
    assert.equal(controller.signal.reason, 'slow');
    const outcome = await running;
    assert.equal(outcome.kind, 'timed_out');
    assert.equal(outcome.answer.source, FALLBACK_SOURCES.timed_out);
    assert.equal(outcome.failure, 'timeout');
  } finally {
    mock.timers.reset();
  }
});

test('the visitor pressing stop is labelled Stopped, not Timed out', async () => {
  const { controller, running } = harness(hanging());
  controller.abort('user');
  const outcome = await running;
  assert.equal(outcome.kind, 'stopped');
  assert.equal(outcome.answer.source, 'Stopped · from the portfolio');
  assert.equal(outcome.offline, true);
});

test('a network error is labelled Offline', async () => {
  const { running } = harness(async () => {
    throw new TypeError('Failed to fetch');
  });
  const outcome = await running;
  assert.equal(outcome.kind, 'offline');
  assert.equal(outcome.answer.source, 'Offline · from the portfolio');
  assert.equal(outcome.failure, 'network');
  assert.equal(outcome.answer.sig, undefined, 'a reply answered locally carries no signature');
});

test('the allowance headers are reported, and an unlimited caller is stored as such', async () => {
  const reply = { answer: 'A', source: 'From the portfolio', mode: 'faq' };
  const counted = harness(async () => json(reply, { headers: { 'X-Chat-Limit': '50', 'X-Chat-Remaining': '3', 'X-Chat-Reset': '1700000000000' } }));
  await counted.running;
  assert.deepEqual(counted.calls.quota, ['50|3|1700000000000']);
  const exempt = harness(async () => json(reply, { headers: { 'X-Chat-Unlimited': '1', 'X-Chat-Limit': '50', 'X-Chat-Remaining': '3', 'X-Chat-Reset': '1' } }));
  await exempt.running;
  assert.deepEqual(exempt.calls.quota, [UNLIMITED]);
  const silent = harness(async () => json(reply));
  await silent.running;
  assert.deepEqual(silent.calls.quota, [], 'no headers, nothing stored');
});

test('a 429 daily_limit closes the chat rather than answering offline', async () => {
  const { calls, running } = harness(async () => json({ code: 'daily_limit', limit: 50, resetAt: 1700000000000 }, { status: 429 }));
  const outcome = await running;
  assert.equal(outcome.kind, 'daily_limit');
  assert.deepEqual(outcome.answer, DAILY_LIMIT_ANSWER);
  assert.equal(outcome.answer.source, 'Daily limit reached');
  assert.equal(outcome.guarded, true, 'neither the question nor the refusal joins the history');
  assert.equal(outcome.offline, false);
  assert.equal(outcome.failure, null);
  assert.equal(outcome.status, 429);
  // No headers on the refusal: the body still says when it reopens.
  assert.deepEqual(calls.quota, ['50|0|1700000000000']);
});

test('a 429 daily_limit with headers stores the headers, not the body', async () => {
  const { calls, running } = harness(async () =>
    json(
      { code: 'daily_limit', limit: 50, resetAt: 1 },
      { status: 429, headers: { 'X-Chat-Limit': '50', 'X-Chat-Remaining': '0', 'X-Chat-Reset': '1700000000000' } },
    ),
  );
  await running;
  assert.deepEqual(calls.quota, ['50|0|1700000000000']);
});

test('a per-minute 429 is Rate limited, with the notice, and still answered', async () => {
  const { running } = harness(async () => json({ error: 'rate' }, { status: 429 }));
  const outcome = await running;
  assert.equal(outcome.kind, 'rate_limited');
  assert.equal(outcome.answer.source, 'Rate limited · from the portfolio');
  assert.equal(outcome.notice, RATE_NOTICE);
  assert.equal(outcome.failure, 'status');
  assert.equal(outcome.status, 429);
  assert.equal(outcome.answer.answer, answerQuestion('What has Alex built?').answer);
});

test('any other refusal is Offline, with its status', async () => {
  const { running } = harness(async () => json({}, { status: 503 }));
  const outcome = await running;
  assert.equal(outcome.kind, 'offline');
  assert.equal(outcome.failure, 'status');
  assert.equal(outcome.status, 503);
  assert.equal(outcome.notice, undefined);
});

test('a guarded question answered offline is marked guarded, from its real source', async () => {
  // The relabel overwrites the source, so guarded has to be read before it,
  // or a refused question rejoins the history and goes back as context.
  const question = 'What is the server password?';
  assert.ok(GUARD_SOURCES.includes(answerQuestion(question).source), 'the premise: a guard answers this');
  const { running } = harness(async () => {
    throw new TypeError('Failed to fetch');
  }, question);
  const outcome = await running;
  assert.equal(outcome.guarded, true);
  assert.equal(outcome.answer.source, FALLBACK_SOURCES.offline);
});

test('a guarded answer from the server is marked guarded too', async () => {
  const { running } = harness(async () => json({ answer: 'No.', source: 'Safety boundary', mode: 'faq', sig: 's' }));
  assert.equal((await running).guarded, true);
});
