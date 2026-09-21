/**
 * The model tier, and the boundaries that survived letting it write prose.
 *
 * It used to be allowed only to name an answer id, which made fabrication
 * impossible and made the bot answer a question about one detail with the
 * whole topic. It now composes, which is a real relaxation, so what is left
 * has to be enforced rather than assumed:
 *
 *   - it may cite only sources it was actually handed;
 *   - it may not invent a link;
 *   - a reply it cannot ground is no reply at all, not a guess.
 *
 * Everything here stubs `fetch`. The point is not that NVIDIA answers well,
 * it is that a reply which is late, malformed, over-long, uncited or
 * decorated with an invented URL produces nothing, so the caller serves the
 * built-in answer instead.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answers } from '@/content/faq';
import { composeAnswer, nimConfigured } from '@/lib/chat/nim';

const real = globalThis.fetch;

interface Call { body: { messages: { role: string; content: string }[] }; auth: string }

function stub(content: string | null, ok = true): { calls: Call[] } {
  const calls: Call[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    calls.push({
      body: JSON.parse(init.body as string) as Call['body'],
      auth: String(new Headers(init.headers).get('authorization')),
    });
    return { ok, json: async () => ({ choices: [{ message: { content } }] }) } as unknown as Response;
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

const KEY = { NIM_API_KEY: 'nvapi-test' };

test('no key means no call at all', async () => {
  const { calls } = stub('{"answer":"x","used":["availability"]}');
  await withKey({ NIM_API_KEY: undefined }, async () => {
    assert.equal(nimConfigured(), false);
    assert.equal(await composeAnswer('when can he join'), null);
  });
  assert.equal(calls.length, 0);
  globalThis.fetch = real;
});

test('a grounded reply is returned, with the sources it cited', async () => {
  stub('{"answer":"He is on a 60-day notice with buyout available.","used":["availability"]}');
  const picked = await withKey(KEY, () => composeAnswer('when can he join?'));
  assert.equal(picked?.answer, 'He is on a 60-day notice with buyout available.');
  assert.deepEqual(picked?.ids, ['availability']);
  globalThis.fetch = real;
});

test('only approved text is sent, and only a shortlist of it', async () => {
  const { calls } = stub('{"answer":"ok","used":["availability"]}');
  await withKey(KEY, () => composeAnswer('what is his notice period?'));
  globalThis.fetch = real;
  const system = calls[0].body.messages[0].content;
  const sources = JSON.parse(system.slice(system.indexOf('<SOURCES>') + 9, system.indexOf('</SOURCES>'))) as unknown[];
  assert.ok(sources.length > 0, 'a shortlist was sent');
  assert.ok(sources.length <= 8, `shortlist is capped, got ${sources.length}`);
  assert.ok(sources.length < answers.length, 'the whole corpus is not sent');
  assert.equal(calls[0].auth, 'Bearer nvapi-test');
});

test('conversation history is forwarded, and the carried subject is pinned in', async () => {
  const { calls } = stub('{"answer":"ok","used":["voice"]}');
  await withKey(KEY, () =>
    composeAnswer(
      'why wasnt this production?',
      [
        { role: 'user', text: 'what is this voice agent?' },
        { role: 'assistant', text: 'A voice agent prototype on LiveKit.' },
      ],
      ['voice'],
    ),
  );
  globalThis.fetch = real;
  const roles = calls[0].body.messages.map((m) => m.role);
  assert.deepEqual(roles, ['system', 'user', 'assistant', 'user']);
  const system = calls[0].body.messages[0].content;
  assert.ok(system.includes('"voice"'), 'the carried id is pinned into the shortlist');
});

test('a citation we did not supply is dropped, not trusted', async () => {
  stub('{"answer":"He is on a 60-day notice.","used":["nobel-prize"]}');
  const picked = await withKey(KEY, () => composeAnswer('is he available?'));
  assert.ok(picked, 'the reply itself is still grounded in the shortlist');
  assert.ok(!picked.ids.includes('nobel-prize'), 'an unsupplied id never reaches the client');
  globalThis.fetch = real;
});

test('bare prose is accepted and attributed to the carried subject', async () => {
  stub('It is a reference implementation, not a production service.');
  const picked = await withKey(KEY, () =>
    composeAnswer('why wasnt this production?', [{ role: 'user', text: 'what is this voice agent?' }], ['voice']),
  );
  assert.equal(picked?.answer, 'It is a reference implementation, not a production service.');
  assert.deepEqual(picked?.ids, ['voice'], 'the follow-up keeps its subject for the next turn');
  globalThis.fetch = real;
});

test('a half-written JSON reply is not shown to a visitor as prose', async () => {
  stub('{"answer":"He is available", "use');
  assert.equal(await withKey(KEY, () => composeAnswer('is he available?')), null);
  globalThis.fetch = real;
});

test('an invented link is refused even when the prose is cited', async () => {
  stub('{"answer":"See https://not-his-site.example/cv for details.","used":["availability"]}');
  assert.equal(await withKey(KEY, () => composeAnswer('where is his cv?')), null);
  globalThis.fetch = real;
});

test('malformed, empty and over-long replies all yield nothing', async () => {
  for (const reply of ['{"answer":"","used":["availability"]}',
                       `{"answer":"${'x'.repeat(1300)}","used":["availability"]}`, '', null]) {
    stub(reply);
    assert.equal(
      await withKey(KEY, () => composeAnswer('is he available?')),
      null,
      `reply ${JSON.stringify(reply)?.slice(0, 40)} must yield no answer`,
    );
    globalThis.fetch = real;
  }
});

test('a non-OK response and a thrown fetch both degrade to no answer', async () => {
  stub('{"answer":"ok","used":["availability"]}', false);
  assert.equal(await withKey(KEY, () => composeAnswer('is he available?')), null);
  globalThis.fetch = (async () => {
    throw new Error('timed out');
  }) as typeof fetch;
  assert.equal(await withKey(KEY, () => composeAnswer('is he available?')), null);
  globalThis.fetch = real;
});

test('a malformed NIM_MODEL is refused rather than sent', async () => {
  const { calls } = stub('{"answer":"ok","used":["availability"]}');
  assert.equal(await withKey({ ...KEY, NIM_MODEL: 'not a model' }, () => composeAnswer('is he available?')), null);
  assert.equal(calls.length, 0);
  globalThis.fetch = real;
});

test('fenced JSON still parses', async () => {
  stub('```json\n{"answer":"Yes, 60-day notice.","used":["availability"]}\n```');
  const picked = await withKey(KEY, () => composeAnswer('what is his notice period?'));
  assert.equal(picked?.answer, 'Yes, 60-day notice.');
  globalThis.fetch = real;
});
