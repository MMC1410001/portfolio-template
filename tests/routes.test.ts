/**
 * The route handlers themselves, called as functions with a real Request.
 *
 * Until tests/ts-hooks.mjs mapped `cloudflare:workers` and `next/server` onto
 * tests/stubs/, no test could import app/api/**, so the order the handlers
 * apply their checks in was covered only by replaying a live dev server
 * (tests/chat.mjs, tests/analytics.mjs), which runs with raised limits and so
 * never reaches a 429. The lib/ pieces each have tests; these are for what
 * only the route decides: which refusal wins, and what is charged before it.
 *
 * The database is an in-memory SQLite behind the D1 facade, bound per test,
 * and the schema is created by the route's own ensureSchema() call.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearDatabase, bindDatabase } from './stubs/cloudflare-workers';
import { drainAfter } from './stubs/next-server';
import { __resetSchemaLatch } from '../lib/analytics/db';
import { resetTrustedCache } from '../lib/analytics/trusted';
import { MAX_BODY_BYTES } from '../lib/analytics/payload';
import { DAILY_LIMIT_CODE, QUOTA_HEADERS } from '../lib/chat/quota';
import { POST as chat } from '../app/api/chat/route';
import { POST as track } from '../app/api/track/route';
import { POST as adminAnalytics } from '../app/api/admin/analytics/route';
import { POST as adminSession } from '../app/api/admin/session/route';

const TOKEN = 't'.repeat(40);
const IP = '198.51.100.7';

/** Every variable a route reads, unset unless a test sets it, so the host's shell cannot leak in. */
const BASE: Record<string, string | undefined> = {
  ANALYTICS_IP_SALT: 's'.repeat(48),
  ADMIN_TOKEN: undefined,
  ADMIN_EMAILS: undefined,
  GOOGLE_CLIENT_ID: undefined,
  TRUST_PLATFORM_AUTH_HEADER: undefined,
  NIM_API_KEY: undefined,
  PYTHON_CHAT_URL: undefined,
  CHAT_BACKEND_TOKEN: undefined,
  CHAT_RATE_LIMIT: undefined,
  CHAT_DAILY_LIMIT: undefined,
  CHAT_DAILY_NETWORK_LIMIT: undefined,
  CHAT_UNLIMITED_CIDRS: undefined,
  ANALYTICS_INTERNAL_CIDRS: undefined,
  ANALYTICS_INTERNAL_VISITORS: undefined,
};

type Db = ReturnType<typeof bindDatabase>;

/** A fresh database (or none), the env above plus `vars`, and everything restored after. */
async function scenario(vars: Record<string, string | undefined>, run: (db: Db | null) => Promise<void>, withDb = true) {
  const merged = { ...BASE, ...vars };
  const saved = Object.fromEntries(Object.keys(merged).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(merged)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  // Both are memoised per isolate, and every test here is a new "isolate".
  __resetSchemaLatch();
  resetTrustedCache();
  const db = withDb ? bindDatabase() : null;
  try {
    await run(db);
  } finally {
    await drainAfter();
    clearDatabase();
    db?.close();
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://example.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** Asks one question as one browser, carrying the quota cookie the way the panel's fetch does. */
function visitor(headers: Record<string, string> = {}) {
  let cookie = '';
  return async (message = 'What has Alex built?') => {
    const response = await chat(post('/api/chat', { message }, { 'cf-connecting-ip': IP, ...(cookie ? { cookie } : {}), ...headers }));
    const minted = response.headers.get('set-cookie');
    if (minted) cookie = minted.split(';')[0];
    return response;
  };
}

function browserQuestions(db: Db | null): number {
  assert.ok(db, 'this test needs a database');
  return (db.raw.prepare(`SELECT COALESCE(SUM(questions), 0) AS n FROM chat_quota WHERE bucket LIKE 'b:%'`).get() as { n: number }).n;
}

// ── /api/admin/* ────────────────────────────────────────────────────────────

test('admin analytics: an unauthorised POST is a 404, with or without a token configured', async () => {
  await scenario({}, async () => {
    assert.equal((await adminAnalytics(post('/api/admin/analytics', { action: 'whoami' }))).status, 404);
  });
  await scenario({ ADMIN_TOKEN: TOKEN }, async () => {
    const attempts: Record<string, string>[] = [{}, { authorization: 'Bearer wrong' }, { authorization: `Bearer ${TOKEN}x` }, { cookie: 'pa_admin=forged' }];
    for (const headers of attempts) {
      const response = await adminAnalytics(post('/api/admin/analytics', { action: 'whoami' }, headers));
      assert.equal(response.status, 404);
      assert.equal(await response.text(), 'Not found');
    }
  });
});

test('admin analytics: the bearer token is let in, so the 404s above are the gate and not a broken import', async () => {
  await scenario({ ADMIN_TOKEN: TOKEN }, async () => {
    const response = await adminAnalytics(post('/api/admin/analytics', { action: 'whoami' }, { authorization: `Bearer ${TOKEN}` }));
    assert.equal(response.status, 200);
    const body = await response.json() as { identity: { via: string }; db: { resolved: boolean; binding: string } };
    assert.equal(body.identity.via, 'token');
    assert.deepEqual(body.db, { resolved: true, binding: 'ANALYTICS_DB', via: 'name' });
  });
});

test('admin session: a bad token, a weak configured token, or junk JSON is a 404, never a 401', async () => {
  await scenario({ ADMIN_TOKEN: undefined }, async () => {
    assert.equal((await adminSession(post('/api/admin/session', { token: TOKEN }))).status, 404);
  });
  await scenario({ ADMIN_TOKEN: 'short' }, async () => {
    assert.equal((await adminSession(post('/api/admin/session', { token: 'short' }))).status, 404);
  });
  await scenario({ ADMIN_TOKEN: TOKEN }, async () => {
    for (const body of [{ token: 'wrong' }, { token: '' }, {}, '{not json']) {
      const response = await adminSession(post('/api/admin/session', body));
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('set-cookie'), null);
    }
  });
});

test('admin session: the right token mints a cookie the analytics gate accepts', async () => {
  await scenario({ ADMIN_TOKEN: TOKEN }, async () => {
    const response = await adminSession(post('/api/admin/session', { token: TOKEN }));
    assert.equal(response.status, 200);
    const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0];
    assert.match(cookie, /^pa_admin=/);
    assert.ok(!cookie.includes(TOKEN), 'the cookie is a signed session, never the token itself');
    const gated = await adminAnalytics(post('/api/admin/analytics', { action: 'whoami' }, { cookie }));
    assert.equal(gated.status, 200);
  });
});

// ── /api/chat ───────────────────────────────────────────────────────────────

test('chat: an ordinary question is answered and told its allowance', async () => {
  await scenario({}, async () => {
    const response = await visitor()();
    assert.equal(response.status, 200);
    const body = await response.json() as { answer: string; source: string };
    assert.ok(body.answer.length > 0);
    assert.equal(response.headers.get(QUOTA_HEADERS.limit), '50');
    assert.equal(response.headers.get(QUOTA_HEADERS.remaining), '49');
    assert.equal(response.headers.get(QUOTA_HEADERS.unlimited), null);
    assert.match(response.headers.get('set-cookie') ?? '', /^pf_chat=/);
  });
});

test('chat: the per-minute limit refuses with a plain 429, and the refused request is not charged to the day', async () => {
  await scenario({ CHAT_RATE_LIMIT: '2' }, async (db) => {
    const ask = visitor();
    assert.equal((await ask()).status, 200);
    assert.equal((await ask()).status, 200);
    const refused = await ask();
    assert.equal(refused.status, 429);
    assert.equal(refused.headers.get('retry-after'), '60');
    const body = await refused.json() as { code?: string };
    assert.equal(body.code, undefined, 'a per-minute refusal is not the daily limit');
    assert.equal(browserQuestions(db), 2);
  });
});

test('chat: the daily allowance refuses with daily_limit once the browser has used it', async () => {
  await scenario({ CHAT_RATE_LIMIT: '100', CHAT_DAILY_LIMIT: '2' }, async () => {
    const ask = visitor();
    assert.equal((await ask()).headers.get(QUOTA_HEADERS.remaining), '1');
    assert.equal((await ask()).headers.get(QUOTA_HEADERS.remaining), '0');
    const refused = await ask();
    assert.equal(refused.status, 429);
    const body = await refused.json() as { code: string; refusedBy: string; limit: number; resetAt: number };
    assert.equal(body.code, DAILY_LIMIT_CODE);
    assert.equal(body.refusedBy, 'browser');
    assert.equal(body.limit, 2);
    assert.ok(Number(refused.headers.get('retry-after')) >= 60);
    assert.equal(refused.headers.get(QUOTA_HEADERS.remaining), '0');
  });
});

test('chat: when both limits are spent, the per-minute one answers first', async () => {
  await scenario({ CHAT_RATE_LIMIT: '1', CHAT_DAILY_LIMIT: '1' }, async (db) => {
    const ask = visitor();
    assert.equal((await ask()).status, 200);
    const refused = await ask();
    assert.equal(refused.status, 429);
    assert.equal((await refused.json() as { code?: string }).code, undefined);
    assert.equal(browserQuestions(db), 1);
  });
});

test('chat: a trusted network is held to neither limit, and is told so with X-Chat-Unlimited', async () => {
  await scenario({ CHAT_RATE_LIMIT: '1', CHAT_DAILY_LIMIT: '1', CHAT_UNLIMITED_CIDRS: '198.51.100.0/24' }, async (db) => {
    const ask = visitor();
    for (let i = 0; i < 4; i++) {
      const response = await ask();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get(QUOTA_HEADERS.unlimited), '1');
      assert.equal(response.headers.get(QUOTA_HEADERS.limit), null);
    }
    assert.equal(browserQuestions(db), 0);
  });
});

test('chat: an admin bearer is exempt too, and a wrong one is not', async () => {
  await scenario({ CHAT_RATE_LIMIT: '1', CHAT_DAILY_LIMIT: '1', ADMIN_TOKEN: TOKEN }, async () => {
    const admin = visitor({ authorization: `Bearer ${TOKEN}` });
    for (let i = 0; i < 3; i++) assert.equal((await admin()).headers.get(QUOTA_HEADERS.unlimited), '1');
    const stranger = visitor({ authorization: 'Bearer wrong', 'cf-connecting-ip': '203.0.113.9' });
    assert.equal((await stranger()).status, 200);
    assert.equal((await stranger()).status, 429);
  });
});

test('chat: with no database there is no limit to enforce, and the question is still answered', async () => {
  await scenario({ CHAT_RATE_LIMIT: '1', CHAT_DAILY_LIMIT: '1' }, async () => {
    const ask = visitor();
    for (let i = 0; i < 3; i++) {
      const response = await ask();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get(QUOTA_HEADERS.limit), null);
    }
  }, false);
});

// ── /api/track ──────────────────────────────────────────────────────────────

test('track: a body that parses to null, a number or an array is refused as bad_json, not an error', async () => {
  await scenario({}, async () => {
    for (const body of ['null', '42', '[]', '{nope']) {
      const response = await track(post('/api/track', body, { 'cf-connecting-ip': IP }));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: false, reason: 'bad_json' });
    }
  });
});

test('track: an oversize body is a 413, by content-length or by the bytes actually streamed', async () => {
  await scenario({}, async (db) => {
    const big = 'x'.repeat(MAX_BODY_BYTES + 1);
    const declared = await track(post('/api/track', big, { 'content-length': String(big.length) }));
    assert.equal(declared.status, 413);

    // A chunked upload declares no length, so only the capped read can catch it.
    const chunk = new TextEncoder().encode('x'.repeat(8192));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > MAX_BODY_BYTES) return controller.close();
        sent += chunk.length;
        controller.enqueue(chunk);
      },
    });
    const chunked = new Request('https://example.test/api/track', { method: 'POST', body: stream, duplex: 'half' } as RequestInit & { duplex: 'half' });
    assert.equal(chunked.headers.get('content-length'), null);
    assert.equal((await track(chunked)).status, 413);

    const rows = db?.raw.prepare(`SELECT name FROM sqlite_master WHERE name = 'events'`).get();
    assert.equal(rows, undefined, 'refused before the schema was even touched');
  });
});

test('track: a cross-site POST is refused before the body is read', async () => {
  await scenario({}, async () => {
    const response = await track(post('/api/track', 'null', { 'sec-fetch-site': 'cross-site' }));
    assert.deepEqual(await response.json(), { ok: false, reason: 'cross_site' });
  });
});
