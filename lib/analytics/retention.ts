/**
 * Retention, deletion without a cron, because there isn't one.
 *
 * `pg_cron` has no analog here and neither does a scheduled Worker: vinext's
 * worker entry is `{ async fetch(...) }` and nothing else, so there is no
 * `scheduled` export to attach a trigger to, and the generated
 * `dist/server/wrangler.json` carries `"triggers": {}`. You could hand-write a
 * custom entry that re-exports vinext's fetch alongside a scheduled handler,
 * but that changes the worker entry the whole site depends on, and whether the
 * Sites deploy pipeline reads `triggers` at all is unverifiable from here. Not
 * something to build on.
 *
 * So: an opportunistic sweep with three triggers and one implementation.
 *   1. on admin read, deterministic and free, wrapped in after() so it never
 *      delays the dashboard
 *   2. on ingest, probabilistically, so retention still happens if nobody
 *      opens the panel for a month
 *   3. the `retention-sweep` admin action, for a hand or an external pinger
 *
 * Genuinely scheduled deletion now exists alongside those three, and does not
 * care what OpenAI Sites supports: `.github/workflows/retention.yml` sends one
 * authenticated POST a day at 02:00 IST. Trigger 3 is what it calls, which is
 * why that action runs `sweep` and not `sweepIfDue`: a cron that skipped its
 * own run because an ingest request had already claimed the day would defeat
 * the point of having a cron.
 */

import { readMeta, writeMeta } from './db';
import { RETENTION_DAYS } from './schema';

const DAY_MS = 86_400_000;
const SWEEP_INTERVAL_MS = DAY_MS;
/** Bounds the write cost of any one sweep. A backlog drains over days. */
const MAX_DELETES_PER_SWEEP = 5_000;
const SWEPT_AT_KEY = 'retention_swept_at';

export interface SweepReport {
  ran: boolean;
  events: number;
  clickPoints: number;
  questionText: number;
  chatHealth: number;
  budget: number;
}

const IDLE: SweepReport = {
  ran: false,
  events: 0,
  clickPoints: 0,
  questionText: 0,
  chatHealth: 0,
  budget: 0,
};

/**
 * Sweep only if a day has passed since the last one.
 *
 * The timestamp is written **first**, before any delete, so two concurrent
 * requests do not both sweep. Losing one day's sweep to a crash after the
 * claim is harmless; two isolates deleting 5,000 rows each in parallel is not.
 */
export async function sweepIfDue(
  db: D1Database,
  now: number,
): Promise<SweepReport> {
  try {
    const last = Number(await readMeta(db, SWEPT_AT_KEY));
    if (Number.isFinite(last) && now - last < SWEEP_INTERVAL_MS) return IDLE;
    await writeMeta(db, SWEPT_AT_KEY, String(now));
    return await sweep(db, now);
  } catch (error) {
    console.error('[analytics] retention sweep failed', error);
    return IDLE;
  }
}

/**
 * Delete past the horizons.
 *
 * `DELETE … LIMIT` needs SQLITE_ENABLE_UPDATE_DELETE_LIMIT, which D1 does not
 * guarantee, so every statement bounds itself with `WHERE id IN (SELECT id …
 * LIMIT n)` instead.
 */
export async function sweep(
  db: D1Database,
  now: number,
): Promise<SweepReport> {
  const cutoff = (days: number) => now - days * DAY_MS;

  const results = await db.batch([
    db
      .prepare(
        `DELETE FROM events WHERE id IN (
           SELECT id FROM events WHERE created_at < ?1 LIMIT ?2)`,
      )
      .bind(cutoff(RETENTION_DAYS.events), MAX_DELETES_PER_SWEEP),
    db
      .prepare(
        `DELETE FROM click_points WHERE id IN (
           SELECT id FROM click_points WHERE created_at < ?1 LIMIT ?2)`,
      )
      .bind(cutoff(RETENTION_DAYS.clickPoints), MAX_DELETES_PER_SWEEP),
    // Question text expires ahead of the row that carries it: the counts,
    // rates and coverage-gap totals survive to the event horizon, the words do
    // not. json_remove leaves every other prop intact, so q_len, `rejected`
    // and `source` keep working after the text is gone.
    db
      .prepare(
        `UPDATE events
            SET props = json_remove(props, '$.q')
          WHERE id IN (
            SELECT id FROM events
             WHERE event = 'chat_ask' AND created_at < ?1
               AND json_valid(props)
               AND json_extract(props, '$.q') IS NOT NULL
             LIMIT ?2)`,
      )
      .bind(cutoff(RETENTION_DAYS.questionText), MAX_DELETES_PER_SWEEP),
    db
      .prepare(`DELETE FROM chat_health WHERE day < ?1`)
      .bind(istDayKeyFor(cutoff(RETENTION_DAYS.chatHealth))),
    db
      .prepare(`DELETE FROM ingest_budget WHERE window_start < ?1`)
      .bind(now - 3_600_000),
  ]);

  const changed = (i: number) => results[i]?.meta?.changes ?? 0;
  return {
    ran: true,
    events: changed(0),
    clickPoints: changed(1),
    questionText: changed(2),
    chatHealth: changed(3),
    budget: changed(4),
  };
}

/** Local copy so this module does not import the whole time helper. */
function istDayKeyFor(at: number): string {
  return new Date(at + 330 * 60_000).toISOString().slice(0, 10);
}
