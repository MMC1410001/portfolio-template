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

import { RETENTION_DAYS } from './schema';
import { istDayKey } from './time';
import { QUOTA_WINDOW_MS } from '@/lib/chat/quota';

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
  /** Daily chat allowance rows whose window closed (chat-quota.ts). */
  chatQuota: number;
}

const IDLE: SweepReport = {
  ran: false,
  events: 0,
  clickPoints: 0,
  questionText: 0,
  chatHealth: 0,
  budget: 0,
  chatQuota: 0,
};

/**
 * Sweep only if a day has passed since the last one.
 *
 * The slot is claimed **first**, before any delete, so two concurrent
 * requests do not both sweep. Losing one day's sweep to a crash after the
 * claim is harmless; two isolates deleting 5,000 rows each in parallel is not.
 *
 * The claim is one conditional UPDATE, not a read and then a write. The old
 * shape (read the timestamp, compare in TypeScript, write the new one) left a
 * window between the read and the write where a second isolate read the same
 * stale value and swept too, which is the exact race the comment above said
 * could not happen. Now the compare and the write are the same statement, so
 * SQLite serialises them and exactly one caller sees a row come back.
 */
export async function sweepIfDue(
  db: D1Database,
  now: number,
): Promise<SweepReport> {
  try {
    if (!(await claimSweep(db, now))) return IDLE;
    return await sweep(db, now);
  } catch (error) {
    console.error('[analytics] retention sweep failed', error);
    return IDLE;
  }
}

/**
 * Take the day's sweep slot, or report that someone else has it.
 *
 * Two statements, deliberately not a batch: `INSERT OR IGNORE` seeds the row
 * on a first ever run (with `0`, so the UPDATE below then claims it), and the
 * UPDATE's RETURNING row is the verdict. scripts/d1-sqlite.ts routes a write
 * inside a batch through `run()`, which discards RETURNING rows, so a batch
 * would read as "never claimed" there while working on D1.
 *
 * `CAST(value AS INTEGER)` reads a non-numeric value as 0 and so sweeps,
 * matching the old `Number(...)` path, which swept on NaN.
 */
export async function claimSweep(db: D1Database, now: number): Promise<boolean> {
  await db
    .prepare(`INSERT OR IGNORE INTO analytics_meta (key, value) VALUES (?1, '0')`)
    .bind(SWEPT_AT_KEY)
    .run();
  const claimed = await db
    .prepare(
      `UPDATE analytics_meta SET value = ?2
        WHERE key = ?1 AND CAST(value AS INTEGER) <= ?3
       RETURNING key`,
    )
    .bind(SWEPT_AT_KEY, String(now), now - SWEEP_INTERVAL_MS)
    .first<{ key: string }>();
  return claimed !== null;
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
      .bind(istDayKey(cutoff(RETENTION_DAYS.chatHealth))),
    db
      .prepare(`DELETE FROM ingest_budget WHERE window_start < ?1`)
      .bind(now - 3_600_000),
    // A window that closed is already reset in place on the next question,
    // so the row is only kept for that; a day past closing it goes.
    db
      .prepare(`DELETE FROM chat_quota WHERE window_start < ?1`)
      .bind(now - 2 * QUOTA_WINDOW_MS),
  ]);

  const changed = (i: number) => results[i]?.meta?.changes ?? 0;
  return {
    ran: true,
    events: changed(0),
    clickPoints: changed(1),
    questionText: changed(2),
    chatHealth: changed(3),
    budget: changed(4),
    chatQuota: changed(5),
  };
}
