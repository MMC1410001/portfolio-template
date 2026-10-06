/**
 * The daily question allowance: 50 per browser, a looser ceiling per network,
 * 24 hours from the first question, and the panel told what is left.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { openDemoDatabase } from '../scripts/d1-sqlite';
import { SCHEMA_STATEMENTS } from '../lib/analytics/schema';
import { applyQuota, chargeChatQuota, chargeModelCall, chargeQuota, chatExemption, chatModelDailyLimit, mintBrowserId, readBrowserId, MODEL_BUCKET, QUOTA_COOKIE, UNLIMITED_VERDICT } from '../lib/analytics/chat-quota';
import { resetTrustedCache } from '../lib/analytics/trusted';
import { DAILY_QUESTIONS, QUOTA_WINDOW_MS, parseQuota, quotaExpired, readQuota, serialiseQuota } from '../lib/chat/quota';

const SECRET = 'q'.repeat(64);
const T0 = 1_790_000_000_000;

function freshDb() {
  const handle = openDemoDatabase();
  for (const sql of SCHEMA_STATEMENTS) handle.raw.exec(sql);
  return handle;
}

async function withEnv(vars: Record<string, string | undefined>, run: () => Promise<void>) {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  try { await run(); } finally {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}

const withCookie = (cookie: string | null) =>
  new Request('https://x.test/api/chat', { method: 'POST', headers: cookie ? { cookie: cookie.split(';')[0] } : {} });

test('the default allowance is 50, and the network backstop is looser', () => {
  assert.equal(DAILY_QUESTIONS, 50);
});

test('chargeQuota allows the limit, refuses one past it without counting higher, and resets after 24 hours', async () => {
  const { db, close } = freshDb();
  try {
    for (let i = 1; i <= 50; i += 1) assert.deepEqual(await chargeQuota(db, 'b:x', 50, T0 + i), { allowed: true, used: i, resetAt: T0 + 1 + QUOTA_WINDOW_MS });
    assert.equal((await chargeQuota(db, 'b:x', 50, T0 + 100)).allowed, false);
    // Capped at limit + 1: a closed chat being hammered does not keep writing a bigger number.
    assert.equal((await chargeQuota(db, 'b:x', 50, T0 + 200)).used, 51);
    // Still refused just before the window closes, open again just after.
    assert.equal((await chargeQuota(db, 'b:x', 50, T0 + QUOTA_WINDOW_MS)).allowed, false);
    assert.deepEqual(await chargeQuota(db, 'b:x', 50, T0 + 1 + QUOTA_WINDOW_MS), { allowed: true, used: 1, resetAt: T0 + 1 + 2 * QUOTA_WINDOW_MS });
    // Another bucket is untouched.
    assert.equal((await chargeQuota(db, 'b:y', 50, T0 + 300)).used, 1);
  } finally {
    close();
  }
});

test('a minted browser id reads back; an edited or forged one does not', async () => {
  const { id, cookie } = await mintBrowserId(SECRET);
  assert.match(cookie, new RegExp(`^${QUOTA_COOKIE}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Path=\/api\/chat/);
  assert.equal(await readBrowserId(withCookie(cookie), SECRET), id);
  assert.equal(await readBrowserId(withCookie(cookie), 'z'.repeat(64)), null);
  const other = crypto.randomUUID();
  const sig = cookie.split(';')[0].split('.').slice(1).join('.');
  assert.equal(await readBrowserId(withCookie(`${QUOTA_COOKIE}=${other}.${sig}`), SECRET), null);
  assert.equal(await readBrowserId(withCookie(`${QUOTA_COOKIE}=nonsense`), SECRET), null);
  assert.equal(await readBrowserId(withCookie(null), SECRET), null);
});

test('chargeChatQuota: one browser gets 50, the 51st is refused and says so', async () => {
  const { db, close } = freshDb();
  try {
    await withEnv({ ANALYTICS_IP_SALT: SECRET, CHAT_DAILY_LIMIT: undefined, CHAT_DAILY_NETWORK_LIMIT: undefined }, async () => {
      const first = await chargeChatQuota(withCookie(null), 'net-a', db, T0);
      assert.equal(first.allowed, true);
      assert.ok(first.setCookie, 'the first question mints the id');
      assert.deepEqual(first.quota, { limit: 50, remaining: 49, resetAt: T0 + QUOTA_WINDOW_MS });
      let last = first;
      for (let i = 2; i <= 50; i += 1) last = await chargeChatQuota(withCookie(first.setCookie), 'net-a', db, T0 + i);
      assert.equal(last.allowed, true);
      assert.equal(last.quota?.remaining, 0);
      assert.equal(last.setCookie, null, 'a known browser is not re-issued an id');
      const refused = await chargeChatQuota(withCookie(first.setCookie), 'net-a', db, T0 + 60);
      assert.deepEqual({ allowed: refused.allowed, by: refused.refusedBy, remaining: refused.quota?.remaining }, { allowed: false, by: 'browser', remaining: 0 });
    });
  } finally {
    close();
  }
});

test('a refused browser does not spend its network\'s allowance', async () => {
  const { db, close } = freshDb();
  try {
    await withEnv({ ANALYTICS_IP_SALT: SECRET, CHAT_DAILY_LIMIT: '2', CHAT_DAILY_NETWORK_LIMIT: '3' }, async () => {
      const a = await chargeChatQuota(withCookie(null), 'office', db, T0);
      await chargeChatQuota(withCookie(a.setCookie), 'office', db, T0 + 1);
      for (let i = 0; i < 10; i += 1) assert.equal((await chargeChatQuota(withCookie(a.setCookie), 'office', db, T0 + 2 + i)).refusedBy, 'browser');
      // A colleague on the same connection still has the network's third question.
      const b = await chargeChatQuota(withCookie(null), 'office', db, T0 + 20);
      assert.equal(b.allowed, true);
      // And a fourth browser on it hits the backstop.
      const c = await chargeChatQuota(withCookie(null), 'office', db, T0 + 21);
      assert.deepEqual({ allowed: c.allowed, by: c.refusedBy }, { allowed: false, by: 'network' });
    });
  } finally {
    close();
  }
});

test('no salt or no database means no allowance, never a refusal', async () => {
  const { db, close } = freshDb();
  try {
    await withEnv({ ANALYTICS_IP_SALT: undefined }, async () => {
      assert.deepEqual(await chargeChatQuota(withCookie(null), 'n', db, T0), { allowed: true, refusedBy: null, quota: null, setCookie: null });
    });
    await withEnv({ ANALYTICS_IP_SALT: SECRET }, async () => {
      assert.equal((await chargeChatQuota(withCookie(null), 'n', null, T0)).allowed, true);
    });
  } finally {
    close();
  }
});

test('the allowance travels in headers, and the panel reads it back', () => {
  const res = applyQuota(new Response('x'), { allowed: true, refusedBy: null, quota: { limit: 50, remaining: 5, resetAt: T0 }, setCookie: 'pf_chat=a.b; Path=/api/chat' });
  assert.deepEqual(readQuota(res.headers), { limit: 50, remaining: 5, resetAt: T0 });
  assert.equal(res.headers.get('set-cookie'), 'pf_chat=a.b; Path=/api/chat');
  assert.equal(readQuota(new Headers()), null);
  assert.equal(readQuota(new Headers({ 'X-Chat-Limit': '50', 'X-Chat-Remaining': 'lots', 'X-Chat-Reset': '1' })), null);
  const stored = serialiseQuota({ limit: 50, remaining: 0, resetAt: T0 });
  assert.deepEqual(parseQuota(stored), { limit: 50, remaining: 0, resetAt: T0 });
  assert.equal(parseQuota(''), null);
  assert.equal(quotaExpired(parseQuota(stored), T0 - 1), false);
  assert.equal(quotaExpired(parseQuota(stored), T0), true);
});

test('every answer the route returns carries the allowance', () => {
  const route = readFileSync(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8');
  const start = route.indexOf('const allowance=');
  assert.ok(start > 0);
  for (const m of route.slice(start).matchAll(/return (?!answered\()[^;]*Response/g)) assert.fail(`unwrapped: ${m[0].slice(0, 80)}`);
  // The panel's request logic lives in lib/chat/ask.ts, beside Chat.tsx.
  const chat = ['../components/portfolio/Chat.tsx', '../lib/chat/ask.ts'].map((path) => { try { return readFileSync(new URL(path, import.meta.url), 'utf8'); } catch { return ''; } }).join('\n');
  assert.match(chat, /readQuota\(response\.headers\)/);
  assert.match(chat, /refusal\?\.code\s*===\s*DAILY_LIMIT_CODE/);
  assert.match(chat, /You can ask up to/);
  assert.match(chat, /left today/);
});

test('the owner is exempt by network or by admin session; nobody else is', async () => {
  const from = (ip: string, headers: Record<string, string> = {}) =>
    // `cf` stands in for the Workers runtime: clientIp() believes the header only beside it.
    Object.defineProperty(new Request('https://x.test/api/chat', { method: 'POST', headers: { 'cf-connecting-ip': ip, ...headers } }), 'cf', { value: {} });
  const token = 't'.repeat(40);
  resetTrustedCache();
  await withEnv({ CHAT_UNLIMITED_CIDRS: '203.0.113.7/32, 2001:db8:1:2::/64', ADMIN_TOKEN: token, ADMIN_EMAILS: undefined }, async () => {
    assert.equal(await chatExemption(from('203.0.113.7'), null), 'network');
    assert.equal(await chatExemption(from('2001:db8:1:2:abcd::9'), null), 'network');
    assert.equal(await chatExemption(from('203.0.113.8'), null), null);
    assert.equal(await chatExemption(from('198.51.100.1', { authorization: `Bearer ${token}` }), null), 'admin');
    assert.equal(await chatExemption(from('198.51.100.1', { authorization: `Bearer ${'x'.repeat(40)}` }), null), null);
    // A forged admin cookie is not an admin.
    assert.equal(await chatExemption(from('198.51.100.1', { cookie: 'pa_admin=9999999999999.forged' }), null), null);
  });
  resetTrustedCache();
  await withEnv({ CHAT_UNLIMITED_CIDRS: undefined, ADMIN_TOKEN: undefined }, async () => {
    assert.equal(await chatExemption(from('203.0.113.7'), null), null);
  });
  const res = applyQuota(new Response('x'), UNLIMITED_VERDICT);
  assert.equal(res.headers.get('X-Chat-Unlimited'), '1');
  assert.equal(res.headers.get('X-Chat-Limit'), null);
});

test('the route skips both limits for an exempt caller, and only for one', () => {
  const route = readFileSync(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8');
  assert.match(route, /if\(!client\.allowed&&!exempt\)return/);
  assert.match(route, /const allowance=exempt\?UNLIMITED_VERDICT:await chargeChatQuota\(/);
});

test('the site-wide model cap is one row, 1000 a day by default, and fails closed', async () => {
  const { db, raw, close } = freshDb();
  try {
    await withEnv({ CHAT_MODEL_DAILY_LIMIT: undefined }, async () => {
      assert.equal(chatModelDailyLimit(), 1000);
    });
    await withEnv({ CHAT_MODEL_DAILY_LIMIT: '2' }, async () => {
      assert.equal(await chargeModelCall(db, T0), 'allowed');
      assert.equal(await chargeModelCall(db, T0 + 1), 'allowed');
      assert.equal(await chargeModelCall(db, T0 + 2), 'capped', 'the third call in the window is refused');
      assert.equal(await chargeModelCall(db, T0 + 1 + QUOTA_WINDOW_MS), 'allowed', 'and the window resets');
    });
    assert.deepEqual(raw.prepare('SELECT bucket FROM chat_quota').all().map((row) => row.bucket), [MODEL_BUCKET]);
  } finally {
    close();
  }
  // The one limit that is a bill rather than a courtesy: unreadable is spent.
  assert.equal(await chargeModelCall(null, T0), 'unavailable', 'no database means no model');
  const broken = { prepare() { throw new Error('D1 is down'); } } as unknown as D1Database;
  assert.equal(await chargeModelCall(broken, T0), 'unavailable', 'a failed count means no model');
});

test('the route checks the model cap before either model path, and an unreadable cap refuses even an exempt caller', () => {
  const route = readFileSync(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8');
  assert.match(route, /const charge=wantsModel\?await chargeModelCall\(ready\):'unavailable';/);
  assert.match(route, /const capped=wantsModel&&\(charge==='unavailable'\|\|charge==='capped'&&!exempt\);/);
  assert.match(route, /if\(body\.stream===true&&wantsModel&&!capped\)/);
  assert.match(route, /if\(wantsModel&&!capped\)/);
});

/** The database, counting how many times the route would wait on D1. */
function countingDb(db: D1Database) {
  const trips = { batch: 0, single: 0 };
  // The local facade runs a batch by calling each statement's own run()/all(),
  // which is one round trip on D1, not several, so those are not counted.
  let inBatch = false;
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => new Proxy(statement, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver) as unknown;
      if (key === 'bind') return (...args: unknown[]) => wrap((value as (...a: unknown[]) => D1PreparedStatement).apply(target, args));
      if (key === 'first' || key === 'run' || key === 'all') return (...args: unknown[]) => { if (!inBatch) trips.single += 1; return (value as (...a: unknown[]) => unknown).apply(target, args); };
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
  const counted = {
    prepare: (sql: string) => wrap(db.prepare(sql)),
    batch: async (statements: D1PreparedStatement[]) => {
      trips.batch += 1;
      inBatch = true;
      try { return await db.batch(statements); } finally { inBatch = false; }
    },
  } as unknown as D1Database;
  return { counted, trips };
}

test('browser and network are charged in one round trip, and the browser still gates the network', async () => {
  const { db, raw, close } = freshDb();
  try {
    await withEnv({ ANALYTICS_IP_SALT: SECRET, CHAT_DAILY_LIMIT: '2', CHAT_DAILY_NETWORK_LIMIT: '50' }, async () => {
      const { counted, trips } = countingDb(db);
      const a = await chargeChatQuota(withCookie(null), 'office', counted, T0);
      assert.deepEqual(trips, { batch: 1, single: 0 }, 'one batch, no other statement');
      await chargeChatQuota(withCookie(a.setCookie), 'office', counted, T0 + 1);
      const refused = await chargeChatQuota(withCookie(a.setCookie), 'office', counted, T0 + 2);
      assert.deepEqual({ allowed: refused.allowed, by: refused.refusedBy, remaining: refused.quota?.remaining }, { allowed: false, by: 'browser', remaining: 0 });
      assert.equal(trips.batch, 3);
      const count = (bucket: string) => (raw.prepare('SELECT questions FROM chat_quota WHERE bucket = ?').get(bucket) as { questions: number } | undefined)?.questions;
      assert.equal(count('n:office'), 2, 'the refused third question did not reach the network row');
      // And with no network bucket, the browser alone is charged, still in one trip.
      const solo = await chargeChatQuota(withCookie(null), null, counted, T0 + 3);
      assert.equal(solo.allowed, true);
      assert.equal(solo.quota?.remaining, 1);
      assert.equal(trips.batch, 4);
    });
  } finally {
    close();
  }
});

test('a network window that has lapsed is reset by the gated charge, the same as the browser\'s', async () => {
  const { db, raw, close } = freshDb();
  try {
    await withEnv({ ANALYTICS_IP_SALT: SECRET, CHAT_DAILY_LIMIT: '5', CHAT_DAILY_NETWORK_LIMIT: '1' }, async () => {
      assert.equal((await chargeChatQuota(withCookie(null), 'cafe', db, T0)).allowed, true);
      const second = await chargeChatQuota(withCookie(null), 'cafe', db, T0 + 1);
      assert.deepEqual({ allowed: second.allowed, by: second.refusedBy, resetAt: second.quota?.resetAt }, { allowed: false, by: 'network', resetAt: T0 + QUOTA_WINDOW_MS });
      const later = await chargeChatQuota(withCookie(null), 'cafe', db, T0 + QUOTA_WINDOW_MS + 1);
      assert.equal(later.allowed, true);
      assert.deepEqual({ ...raw.prepare('SELECT questions, window_start FROM chat_quota WHERE bucket = ?').get('n:cafe') }, { questions: 1, window_start: T0 + QUOTA_WINDOW_MS + 1 });
    });
  } finally {
    close();
  }
});
