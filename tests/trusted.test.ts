/**
 * Trusted networks: one list, edited in /admin, that both excludes the owner
 * from analytics and lifts the chat limits.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDemoDatabase } from '../scripts/d1-sqlite';
import { SCHEMA_STATEMENTS } from '../lib/analytics/schema';
import { addTrusted, listTrusted, MAX_TRUSTED, normaliseCidr, removeTrusted, resetTrustedCache, trustedCidrs } from '../lib/analytics/trusted';
import { chatExemption } from '../lib/analytics/chat-quota';
import { matchesAnyCidr } from '../lib/analytics/net';
import { ADMIN_SECTION_IDS, SHOWCASE_SECTION_IDS } from '../components/admin/admin-sections';

function freshDb() {
  const handle = openDemoDatabase();
  for (const sql of SCHEMA_STATEMENTS) handle.raw.exec(sql);
  return handle;
}

async function withEnv(vars: Record<string, string | undefined>, run: () => Promise<void>) {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  resetTrustedCache();
  try { await run(); } finally {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    resetTrustedCache();
  }
}

const NO_ENV = { ANALYTICS_INTERNAL_CIDRS: undefined, CHAT_UNLIMITED_CIDRS: undefined };

test('an address or a range is accepted in canonical form; anything broad or malformed is not', () => {
  assert.equal(normaliseCidr(' 203.0.113.7 '), '203.0.113.7/32');
  assert.equal(normaliseCidr('203.0.113.0/24'), '203.0.113.0/24');
  assert.equal(normaliseCidr('2001:DB8:1:2::/64'), '2001:db8:1:2::/64');
  assert.equal(normaliseCidr('2001:db8::1'), '2001:db8::1/128');
  for (const bad of ['', '0.0.0.0/0', '10.0.0.0/8', '::/0', '2001::/16', '999.1.1.1', 'localhost', '1.2.3.4, 5.6.7.8', '1.2.3.4/33']) {
    assert.equal(normaliseCidr(bad), null, bad);
  }
});

test('panel rows are added, relabelled, listed after the env floor, and removed', async () => {
  const { db, close } = freshDb();
  try {
    await withEnv({ ...NO_ENV, CHAT_UNLIMITED_CIDRS: '198.51.100.9/32' }, async () => {
      assert.deepEqual(await addTrusted(db, '203.0.113.7', 'Home', 'owner@x.com', 1000), { ok: true });
      assert.deepEqual(await addTrusted(db, '203.0.113.7/32', 'Home, renamed', 'owner@x.com', 2000), { ok: true });
      const list = await listTrusted(db);
      assert.deepEqual(list.map((e) => [e.cidr, e.source, e.label]), [
        ['198.51.100.9/32', 'env', 'CHAT_UNLIMITED_CIDRS'],
        ['203.0.113.7/32', 'panel', 'Home, renamed'],
      ]);
      assert.equal(list[1].addedAt, 1000, 'relabelling keeps the original date');
      // The env floor cannot be removed from the panel.
      assert.deepEqual(await removeTrusted(db, '198.51.100.9'), { ok: false, error: 'env' });
      assert.deepEqual(await removeTrusted(db, '203.0.113.7'), { ok: true });
      assert.deepEqual(await removeTrusted(db, '203.0.113.7'), { ok: false, error: 'missing' });
      assert.deepEqual(await addTrusted(db, '0.0.0.0/0', '', 'x'), { ok: false, error: 'invalid' });
    });
  } finally {
    close();
  }
});

test('the list is capped', async () => {
  const { db, close } = freshDb();
  try {
    await withEnv(NO_ENV, async () => {
      for (let i = 0; i < MAX_TRUSTED; i += 1) assert.equal((await addTrusted(db, `203.0.${i}.1`, '', 'x')).ok, true);
      assert.deepEqual(await addTrusted(db, '198.51.100.1', '', 'x'), { ok: false, error: 'full' });
      // Relabelling an existing row is not an addition.
      assert.deepEqual(await addTrusted(db, '203.0.0.1', 'renamed', 'x'), { ok: true });
    });
  } finally {
    close();
  }
});

test('a saved network matches at once in this isolate, and within the cache window elsewhere', async () => {
  const { db, close } = freshDb();
  try {
    await withEnv(NO_ENV, async () => {
      const t = 5_000_000;
      assert.equal(matchesAnyCidr('203.0.113.7', await trustedCidrs(db, t)), false);
      // Another isolate's write: this one's cache still says no, until it expires.
      await db.prepare(`INSERT INTO trusted_networks (cidr, label, added_at, added_by) VALUES ('203.0.113.7/32', '', 1, '')`).run();
      assert.equal(matchesAnyCidr('203.0.113.7', await trustedCidrs(db, t + 1_000)), false);
      assert.equal(matchesAnyCidr('203.0.113.7', await trustedCidrs(db, t + 31_000)), true);
      // A write in this isolate is visible to its very next read.
      await addTrusted(db, '198.51.100.4', '', 'x');
      assert.equal(matchesAnyCidr('198.51.100.4', await trustedCidrs(db, t + 31_001)), true);
    });
  } finally {
    close();
  }
});

test('a network added in the panel lifts the chat limits for it', async () => {
  const { db, close } = freshDb();
  try {
    await withEnv({ ...NO_ENV, ADMIN_TOKEN: undefined }, async () => {
      const from = (ip: string) => new Request('https://x.test/api/chat', { method: 'POST', headers: { 'cf-connecting-ip': ip } });
      assert.equal(await chatExemption(from('203.0.113.7'), db), null);
      await addTrusted(db, '203.0.113.0/24', 'Office', 'x');
      assert.equal(await chatExemption(from('203.0.113.7'), db), 'network');
      assert.equal(await chatExemption(from('198.51.100.7'), db), null);
      // No database: only the env floor counts, and the answer is still "not exempt", never an error.
      resetTrustedCache();
      assert.equal(await chatExemption(from('203.0.113.7'), null), null);
    });
  } finally {
    close();
  }
});

test('the settings section is on /admin and not on the public showcase', () => {
  assert.ok(ADMIN_SECTION_IDS.includes('admin-trusted'));
  assert.ok(!SHOWCASE_SECTION_IDS.includes('admin-trusted'));
});
