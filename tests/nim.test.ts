/**
 * The NIM tier, and the one property that must survive every refactor:
 * the model can choose an answer, and can never write one.
 *
 * Everything here stubs `fetch`. The point is not that NVIDIA replies
 * correctly - it is that a reply which is late, malformed, hostile, or names
 * an id nobody approved produces no prose at all, so the caller falls back to
 * the regex answer instead of serving something Alex did not write.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answers } from '@/content/faq';
import { nimConfigured, selectAnswer } from '@/lib/chat/nim';

const real = globalThis.fetch;

/** Reply with `content`, as an OpenAI-compatible chat completion would. */
function stub(content: string | null, ok = true): { calls: { body: unknown; auth: string }[] } {
  const calls: { body: unknown; auth: string }[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    calls.push({
      body: JSON.parse(init.body as string),
      auth: String(new Headers(init.headers).get('authorization')),
    });
    return {
      ok,
      json: async () => ({ choices: [{ message: { content } }] }),
    } as unknown as Response;
  }) as typeof fetch;
  return { calls };
}

async function withKey<T>(env: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const before = { ...process.env };
  Object.assign(process.env, env);
  for (const [name, value] of Object.entries(env)) if (value === undefined) delete process.env[name];
  try {
    return await run();
  } finally {
    for (const name of Object.keys(env)) delete process.env[name];
    Object.assign(process.env, before);
  }
}

test('no key means no call at all', async () => {
  const { calls } = stub('{"answer_id":"availability"}');
  await withKey({ NIM_API_KEY: undefined }, async () => {
    assert.equal(nimConfigured(), false);
    assert.equal(await selectAnswer('when can he join'), null);
  });
  assert.equal(calls.length, 0);
  globalThis.fetch = real;
});

test('a chosen id is served as that answer\'s own approved prose', async () => {
  const target = answers.find((entry) => entry.id === 'availability');
  assert.ok(target, 'the availability answer is the fixture this test selects');
  const { calls } = stub(`{"answer_id":"availability"}`);
  const picked = await withKey({ NIM_API_KEY: 'nvapi-test' }, () =>
    selectAnswer('can i hire him, when is he free to start?'),
  );
  assert.equal(picked?.answer, target.answer);
  assert.equal(picked?.id, 'availability');
  assert.equal(calls[0].auth, 'Bearer nvapi-test');
  globalThis.fetch = real;
});

test('the catalogue sent to NVIDIA carries ids and patterns, never the prose', async () => {
  stub('{"answer_id":"unknown"}');
  await withKey({ NIM_API_KEY: 'nvapi-test' }, () => selectAnswer('anything'));
  globalThis.fetch = real;
  // Re-run with a capture we can read.
  const { calls } = stub('{"answer_id":"unknown"}');
  await withKey({ NIM_API_KEY: 'nvapi-test' }, () => selectAnswer('anything else'));
  globalThis.fetch = real;
  const sent = JSON.stringify(calls[0].body);
  const sample = answers.find((entry) => entry.id === 'availability');
  assert.ok(sample);
  assert.ok(sent.includes('availability'), 'ids are sent');
  assert.ok(!sent.includes(sample.answer.slice(0, 40)), 'answer prose is not sent');
});

test('prose the model invents is discarded', async () => {
  for (const reply of [
    'Alex is available from next Monday.',
    '{"answer_id":"there-is-no-such-id"}',
    '{"answer_id":"unknown"}',
    '{}',
    '',
    null,
  ]) {
    const { calls } = stub(reply);
    const picked = await withKey({ NIM_API_KEY: 'nvapi-test' }, () => selectAnswer(`q ${String(reply)}`));
    assert.equal(picked, null, `reply ${JSON.stringify(reply)} must yield no answer`);
    assert.equal(calls.length, 1);
    globalThis.fetch = real;
  }
});

test('a non-OK response and a thrown fetch both degrade to no answer', async () => {
  stub('{"answer_id":"availability"}', false);
  assert.equal(
    await withKey({ NIM_API_KEY: 'nvapi-test' }, () => selectAnswer('a failing question')),
    null,
  );
  globalThis.fetch = (async () => {
    throw new Error('timed out');
  }) as typeof fetch;
  assert.equal(
    await withKey({ NIM_API_KEY: 'nvapi-test' }, () => selectAnswer('another failing question')),
    null,
  );
  globalThis.fetch = real;
});

test('a malformed NIM_MODEL is refused rather than sent', async () => {
  const { calls } = stub('{"answer_id":"availability"}');
  const picked = await withKey({ NIM_API_KEY: 'nvapi-test', NIM_MODEL: 'not a model' }, () =>
    selectAnswer('when can he join'),
  );
  assert.equal(picked, null);
  assert.equal(calls.length, 0);
  globalThis.fetch = real;
});

test('fenced or chatty JSON still yields the id', async () => {
  const { calls } = stub('```json\n{"answer_id": "visa"}\n```');
  const picked = await withKey({ NIM_API_KEY: 'nvapi-test' }, () => selectAnswer('work permit for germany'));
  assert.equal(picked?.id, 'visa');
  assert.equal(calls.length, 1);
  globalThis.fetch = real;
});

test('an identical question is answered from the isolate cache', async () => {
  const { calls } = stub('{"answer_id":"visa"}');
  await withKey({ NIM_API_KEY: 'nvapi-test' }, async () => {
    const first = await selectAnswer('  Does he need a VISA?  ');
    const second = await selectAnswer('does he need a visa?');
    assert.equal(first?.id, 'visa');
    assert.equal(second?.id, 'visa');
  });
  assert.equal(calls.length, 1, 'the second ask is served from the cache');
  globalThis.fetch = real;
});
