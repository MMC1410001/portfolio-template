/**
 * /api/admin/session reads its body before anything is authorised, since the
 * body is the credential, so the read is capped.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST } from '../app/api/admin/session/route';

const TOKEN = 't'.repeat(40);

async function withToken(run: () => Promise<void>) {
  const saved = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = TOKEN;
  try { await run(); } finally {
    if (saved === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = saved;
  }
}

const post = (body: string) =>
  POST(new Request('https://x.test/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }));

test('the right token signs in, and the same token in an oversized body does not', async () => {
  await withToken(async () => {
    const ok = await post(JSON.stringify({ token: TOKEN }));
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('Set-Cookie') ?? '', /^pa_admin=/);
    const big = await post(JSON.stringify({ token: TOKEN, pad: 'x'.repeat(17 * 1024) }));
    assert.equal(big.status, 404);
    assert.equal((await post('not json')).status, 404);
    assert.equal((await post('null')).status, 404);
  });
});
