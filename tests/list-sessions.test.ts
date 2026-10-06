/**
 * listSessions applies its LIMIT before the three per-row subqueries rather
 * than after them. That is a pure cost change, so this pins that the rows,
 * their order and every per-row figure match the original shape of the query
 * (subqueries over all of `sess`, then ORDER BY + LIMIT), with more sessions
 * in the range than the limit returns.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDemoDatabase } from '../scripts/d1-sqlite';
import { SCHEMA_STATEMENTS } from '../lib/analytics/schema';
import { validateEvent, type IncomingEvent, type ValidatedEvent } from '../lib/analytics/payload';
import { buildRows, writeBatch } from '../lib/analytics/ingest';
import { classifyUserAgent } from '../lib/analytics/user-agent';
import { listSessions, type QueryOptions } from '../lib/analytics/queries';
import { SESS_CTE, WITH_EV } from '../lib/analytics/sql';

const T0 = Date.UTC(2026, 8, 20);
const OPTIONS: QueryOptions = { window: { since: T0 - 1, until: T0 + 3_600_000, days: 1 }, excludeInternal: false };

/** One session's events, a second apart from `start`, each its own batch. */
async function session(db: D1Database, id: string, start: number, events: IncomingEvent[], internal = false): Promise<void> {
  let at = start;
  for(const [i, raw] of events.entries()){
    const valid = [validateEvent({ ...raw, seq: i + 1 })].filter((e): e is ValidatedEvent => e !== null);
    assert.equal(valid.length, 1, `event ${i} of ${id} validates`);
    const { eventRows, pointRows } = buildRows(valid, {
      sessionId: id, visitorId: null, ua: classifyUserAgent(null), ipHash: 'h', ipPrefix: null, isInternal: internal,
      geo: { country: null, region: null, city: null, asnOrg: null }, attribution: null, now: (at += 1000),
    });
    await writeBatch(db, eventRows, pointRows);
  }
}

/** The query as it was before the limit moved inside. */
const ORIGINAL = `${WITH_EV}, ${SESS_CTE}
  SELECT s.session_id,
         (SELECT COUNT(*) FROM ev e WHERE e.session_id = s.session_id) AS event_count,
         (SELECT GROUP_CONCAT(DISTINCT e.event) FROM ev e WHERE e.session_id = s.session_id) AS verbs,
         (SELECT MAX(is_internal) FROM events x WHERE x.session_id = s.session_id) AS internal
    FROM sess s
   ORDER BY s.last_seen DESC
   LIMIT ?4`;

test('listSessions returns the same rows, in the same order, with more sessions than the limit', async () => {
  const handle = openDemoDatabase();
  for(const sql of SCHEMA_STATEMENTS) handle.raw.exec(sql);
  const { db, close } = handle;
  try {
    // Eight sessions with distinct last_seen, varied event counts and verbs, two internal.
    for(let n = 0; n < 8; n += 1){
      const events: IncomingEvent[] = [{ event: 'visit', path: '/' }];
      for(let k = 0; k < n % 3; k += 1) events.push({ event: 'chat_open', path: '/' });
      if(n % 2) events.push({ event: 'page_view', path: '/#work', duration_ms: 2000, props: { from: null, to: null } });
      await session(db, `00000000-0000-4000-8000-00000000000${n}`, T0 + n * 60_000, events, n === 5 || n === 2);
    }
    for(const limit of [3, 5, 200]){
      const rows = await listSessions(db, { ...OPTIONS, limit });
      const expected = (await db.prepare(ORIGINAL).bind(OPTIONS.window.since, OPTIONS.window.until, '[]', limit)
        .all<{ session_id: string; event_count: number; verbs: string | null; internal: number }>()).results ?? [];
      assert.equal(rows.length, Math.min(limit, 8));
      assert.deepEqual(
        rows.map((r) => [r.sessionId, r.events, r.verbs, r.isInternal]),
        expected.map((r) => [r.session_id, Number(r.event_count), r.verbs, Number(r.internal) === 1]),
        `limit ${limit}`,
      );
      // Newest first, and the newest really are the ones returned.
      assert.deepEqual(rows.map((r) => r.sessionId.slice(-1)), ['7', '6', '5', '4', '3', '2', '1', '0'].slice(0, Math.min(limit, 8)));
    }
    assert.ok((await listSessions(db, { ...OPTIONS, limit: 3 })).some((r) => r.isInternal), 'the internal flag survives the inner limit');
  } finally {
    close();
  }
});
