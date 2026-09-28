/**
 * The dashboard queries against a real SQLite, for the two things the demo
 * seeder cannot exercise: tab switches (it emits one terminal row per session)
 * and the per-isolate internal-session cache (it opens one database).
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
import { overview, type QueryOptions } from '../lib/analytics/queries';

function freshDb() {
  const handle = openDemoDatabase();
  for (const sql of SCHEMA_STATEMENTS) handle.raw.exec(sql);
  return handle;
}

const T0 = Date.UTC(2026, 8, 20);
const OPTIONS: QueryOptions = { window: { since: T0 - 1, until: T0 + 3_600_000, days: 1 }, excludeInternal: true };

/** One session's events, each written as its own batch a second apart, in order. */
async function session(db: D1Database, id: string, events: IncomingEvent[], internal = false): Promise<void> {
  let at = T0;
  for (const [i, raw] of events.entries()) {
    const valid = [validateEvent({ ...raw, seq: i + 1 })].filter((e): e is ValidatedEvent => e !== null);
    assert.equal(valid.length, 1, `event ${i} of ${id} validates`);
    const { eventRows, pointRows } = buildRows(valid, {
      sessionId: id,
      visitorId: null,
      ua: classifyUserAgent(null),
      ipHash: 'h',
      ipPrefix: null,
      isInternal: internal,
      geo: { country: null, region: null, city: null, asnOrg: null },
      attribution: null,
      now: (at += 1000),
    });
    await writeBatch(db, eventRows, pointRows);
  }
}

const view = (section: string, from: string | null, to: string | null, ms: number, terminal = false): IncomingEvent => ({
  event: 'page_view',
  path: `/#${section}`,
  duration_ms: ms,
  props: { from, to, ...(terminal ? { terminal: true } : {}) },
});

test('a tab switch is neither a second view of the section nor an exit from it', async () => {
  const { db, close } = freshDb();
  try {
    // hero, then work read across two tab switches, then contact, where they left.
    await session(db, '11111111-1111-4111-8111-111111111111', [
      { event: 'visit', path: '/' },
      view('hero', null, 'work', 4000),
      view('work', 'hero', null, 10_000, true),
      view('work', 'work', null, 6000, true),
      view('work', 'work', 'contact', 2000),
      view('contact', 'work', null, 3000, true),
    ]);
    // An ordinary one-section visit.
    await session(db, '22222222-2222-4222-8222-222222222222', [
      { event: 'visit', path: '/' },
      view('hero', null, null, 2000, true),
    ]);

    const o = await overview(db, OPTIONS);
    const by = Object.fromEntries(o.sections.map((s) => [s.path, s]));
    assert.equal(by['/#work'].views, 1, 'three rows, one view');
    assert.equal(by['/#work'].avgSeconds, 18, 'the resumed dwell belongs to that view');
    assert.equal(by['/#work'].exits, 0, 'the tab-switch terminals are not exits');
    assert.equal(by['/#contact'].exits, 1);
    assert.equal(by['/#contact'].exitPct, 100);
    assert.equal(by['/#hero'].views, 2);
    assert.equal(by['/#hero'].exits, 1);
    assert.equal(o.sections.reduce((n, s) => n + s.exits, 0), 2, 'one exit per session');
    // Three sections seen and one: 2 per session, and only the second is shallow.
    assert.equal(o.engagement.sectionsPerSession, 2);
    assert.equal(o.engagement.shallowPct, 50);
    assert.equal(o.daily.reduce((n, d) => n + d.sectionViews, 0), 4);
  } finally {
    close();
  }
});

test('scroll reach and max scroll count the homepage only, since milestones are per page', async () => {
  const { db, close } = freshDb();
  try {
    await session(db, '55555555-5555-4555-8555-555555555555', [
      { event: 'visit', path: '/' },
      { event: 'scroll_depth', path: '/', props: { depth: 25, doc_h: 12_000 } },
      { event: 'scroll_depth', path: '/#work', props: { depth: 50, doc_h: 12_000 } },
      // A one-screen page reaches 100% at once; it says nothing about the portfolio.
      { event: 'scroll_depth', path: '/privacy', props: { depth: 100, doc_h: 900 } },
      { event: 'session_end', path: '/', props: { max_scroll_px: 6000 } },
      { event: 'session_end', path: '/privacy', props: { max_scroll_px: 9000 } },
    ]);
    const o = await overview(db, OPTIONS);
    assert.deepEqual(o.scroll, { sessions: 1, d25: 1, d50: 1, d75: 0, d100: 0 });
    assert.equal(o.engagement.medianScrollPx, 6000);
  } finally {
    close();
  }
});

test('the internal-session cache is per database, never shared between two', async () => {
  const a = freshDb();
  const b = freshDb();
  try {
    await session(a.db, '33333333-3333-4333-8333-333333333333', [{ event: 'visit', path: '/' }], true);
    await session(b.db, '44444444-4444-4444-8444-444444444444', [{ event: 'visit', path: '/' }]);
    // Same window on both, back to back: the second must not read the first's set.
    assert.equal((await overview(a.db, OPTIONS)).internal.sessionsMatched, 1);
    assert.equal((await overview(b.db, OPTIONS)).internal.sessionsMatched, 0);
    assert.equal((await overview(b.db, OPTIONS)).funnel.sessions, 1);
    assert.equal((await overview(a.db, OPTIONS)).funnel.sessions, 0, 'still excluded on a cache hit');
  } finally {
    a.close();
    b.close();
  }
});
