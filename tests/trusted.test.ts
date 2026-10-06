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
import { addTrusted, FALLBACK_CACHE_MS, listTrusted, MAX_TRUSTED, normaliseCidr, removeTrusted, resetTrustedCache, trustedCidrs } from '../lib/analytics/trusted';
import { chatExemption } from '../lib/analytics/chat-quota';
import { matchesAnyCidr, parseCidrList } from '../lib/analytics/net';
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

test('the stored form is the network: host bits masked, IPv6 compressed, so spellings dedupe', () => {
  assert.equal(normaliseCidr('203.0.113.7/24'), '203.0.113.0/24');
  assert.equal(normaliseCidr('2001:0DB8:0000:0000:0000:0000:0000:0001'), '2001:db8::1/128');
  assert.equal(normaliseCidr('2001:db8:1:2:aaaa:bbbb:cccc:dddd/64'), '2001:db8:1:2::/64');
  assert.equal(normaliseCidr('2001:db8:0:0:1:0:0:1'), '2001:db8::1:0:0:1/128', 'the first of two equal zero runs');
  assert.equal(normaliseCidr('2001:db8:0:1:1:1:1:1'), '2001:db8:0:1:1:1:1:1/128', 'a single zero group is not compressed');
  // Malformed IPv6 used to parse, because empty groups were dropped.
  for (const bad of ['1:::2', ':1:2:3:4:5:6:7', '1:2:3:4:5:6:7:', 'a::b::c', '12345::1', 'g::1', '1:2:3:4:5:6:7:8::', '1:2:3:4:5:6:7', 'fe80::1%eth0']) {
    assert.equal(normaliseCidr(bad), null, bad);
  }
});

test('the panel floor is /24 and /48; the env floor stays /16 and /32', () => {
  assert.equal(normaliseCidr('203.0.112.0/23'), null);
  assert.equal(normaliseCidr('2001:db8::/47'), null);
  assert.equal(normaliseCidr('2001:db8::/48'), '2001:db8::/48');
  assert.equal(parseCidrList('10.1.0.0/16')[0]?.raw, '10.1.0.0/16');
  assert.equal(parseCidrList('2001:db8::/32')[0]?.raw, '2001:db8::/32');
});

test('two spellings of one network are one row, and a legacy row is still removable', async () => {
  const { db, raw, close } = freshDb();
  try {
    await withEnv(NO_ENV, async () => {
      await addTrusted(db, '203.0.113.7/24', 'Office', 'x', 1);
      await addTrusted(db, '203.0.113.0/24', 'Office, again', 'x', 2);
      assert.deepEqual((await listTrusted(db)).map((e) => [e.cidr, e.label]), [['203.0.113.0/24', 'Office, again']]);
      // Rows saved before canonical storage, and one wider than today's panel floor.
      raw.exec(`INSERT INTO trusted_networks (cidr, label, added_at, added_by) VALUES ('198.51.100.9/24', '', 3, ''), ('10.20.0.0/20', '', 4, '')`);
      assert.deepEqual(await removeTrusted(db, '198.51.100.9/24'), { ok: true });
      assert.deepEqual(await removeTrusted(db, '10.20.0.0/20'), { ok: true });
      assert.deepEqual(await removeTrusted(db, '10.20.0.0/20'), { ok: false, error: 'missing' });
      assert.deepEqual(await removeTrusted(db, '1:::2'), { ok: false, error: 'invalid' });
    });
  } finally {
    close();
  }
});

test('an env row spelt with host bits still hides the panel copy and refuses removal', async () => {
  const { db, raw, close } = freshDb();
  try {
    await withEnv({ ...NO_ENV, ANALYTICS_INTERNAL_CIDRS: '203.0.113.7/24' }, async () => {
      raw.exec(`INSERT INTO trusted_networks (cidr, label, added_at, added_by) VALUES ('203.0.113.0/24', '', 1, '')`);
      assert.deepEqual((await listTrusted(db)).map((e) => [e.cidr, e.source]), [['203.0.113.0/24', 'env']]);
      assert.deepEqual(await removeTrusted(db, '203.0.113.0/24'), { ok: false, error: 'env' });
    });
  } finally {
    close();
  }
});

test('the env-only fallback is not cached as if it were the list', async () => {
  const { db, close } = freshDb();
  try {
    await withEnv(NO_ENV, async () => {
      await addTrusted(db, '203.0.113.7', '', 'x');
      resetTrustedCache();
      const t = 9_000_000;
      // No database: env only, and nothing is kept, so the next call with one reads it.
      assert.equal(matchesAnyCidr('203.0.113.7', await trustedCidrs(null, t)), false);
      assert.equal(matchesAnyCidr('203.0.113.7', await trustedCidrs(db, t + 1)), true);
      // A failed read: env only, for FALLBACK_CACHE_MS, then the real list again.
      resetTrustedCache();
      const broken = { prepare: () => { throw new Error('D1 is down'); } } as unknown as D1Database;
      const quiet = console.error;
      console.error = () => {};
      try {
        assert.equal(matchesAnyCidr('203.0.113.7', await trustedCidrs(broken, t)), false);
      } finally {
        console.error = quiet;
      }
      assert.equal(matchesAnyCidr('203.0.113.7', await trustedCidrs(db, t + 1)), false, 'within the short window');
      assert.equal(matchesAnyCidr('203.0.113.7', await trustedCidrs(db, t + FALLBACK_CACHE_MS)), true);
    });
  } finally {
    close();
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
      // `cf` stands in for the Workers runtime: clientIp() believes the header only beside it.
      const from = (ip: string) => Object.defineProperty(new Request('https://x.test/api/chat', { method: 'POST', headers: { 'cf-connecting-ip': ip } }), 'cf', { value: {} });
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
