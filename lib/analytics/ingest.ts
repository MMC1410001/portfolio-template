/**
 * Turning a validated payload into rows, and writing them.
 *
 * ── The json_each insert is load-bearing ───────────────────────────────────
 * D1 caps bound parameters at **100 per query**. A 50-event batch across 32
 * columns is 1,600 placeholders and would fail outright; chunking to three
 * rows per statement would mean 17 statements. Passing the whole batch as one
 * JSON string and unrolling it with `json_each(?1)` is one parameter, one
 * statement, any batch size, and the statement text is ~2 KB against D1's
 * 100 KB limit.
 *
 * Two consequences to respect:
 *   - `props` is pre-stringified in TS so json_extract yields plain TEXT with
 *     no JSON-subtype ambiguity
 *   - `id` is omitted so SQLite assigns rowids in array order, which gives the
 *     free ordering tie-break that `COALESCE(seq, id)` relies on
 *
 * ── A deliberate departure from the source system ──────────────────────────
 * Lumen wrote click_points *after* events so a points failure could not
 * lose funnel rows. `batch()` is atomic, so that partial degradation is not
 * available here. Accepting atomicity is the call: the validators already
 * guarantee shape, and a partial write is harder to reason about than none.
 */

import type { ValidatedEvent } from './payload';
import type { UserAgentFacts } from './user-agent';
import { viewportClass } from './user-agent';
import { referrerHost } from './sources';

export interface SessionContext {
  sessionId: string;
  visitorId: string | null;
  ua: UserAgentFacts;
  ipHash: string;
  ipPrefix: string | null;
  isInternal: boolean;
  geo: {
    country: string | null;
    region: string | null;
    city: string | null;
    asnOrg: string | null;
  };
  attribution: Record<string, string | null> | null;
  now: number;
}

interface EventRow {
  session_id: string;
  visitor_id: string | null;
  event: string;
  path: string | null;
  section: string | null;
  mode: string | null;
  referrer: string | null;
  referrer_host: string | null;
  props: string | null;
  viewport_w: number | null;
  viewport_h: number | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  duration_ms: number | null;
  seq: number | null;
  ip_hash: string;
  ip_prefix: string | null;
  is_internal: number;
  country: string | null;
  region: string | null;
  city: string | null;
  asn_org: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  click_id: string | null;
  click_id_source: string | null;
  landing_path: string | null;
  created_at: number;
}

interface PointRow {
  session_id: string;
  path: string;
  section: string | null;
  mode: string | null;
  device: string | null;
  viewport_w: number | null;
  viewport_h: number | null;
  x_pct: number;
  y_pct: number;
  doc_h: number | null;
  selector: string | null;
  kind: string;
  is_internal: number;
  created_at: number;
}

export function buildRows(
  events: readonly ValidatedEvent[],
  ctx: SessionContext,
): { eventRows: EventRow[]; pointRows: PointRow[] } {
  const eventRows: EventRow[] = [];
  const pointRows: PointRow[] = [];
  const a = ctx.attribution;

  for (const e of events) {
    // Attribution is stamped on the `visit` row only. Repeating it would let a
    // later row disagree with the landing one about where the session came
    // from, and on a one-route site there is exactly one visit per session.
    const stamp = e.event === 'visit' ? a : null;

    eventRows.push({
      session_id: ctx.sessionId,
      visitor_id: ctx.visitorId,
      event: e.event,
      path: e.path,
      section: e.section,
      mode: e.mode,
      referrer: e.referrer,
      referrer_host: referrerHost(e.referrer),
      props: e.props ? JSON.stringify(e.props) : null,
      viewport_w: e.viewport_w,
      viewport_h: e.viewport_h,
      device: ctx.ua.device,
      browser: ctx.ua.browser,
      os: ctx.ua.os,
      duration_ms: e.duration_ms,
      seq: e.seq,
      ip_hash: ctx.ipHash,
      ip_prefix: ctx.ipPrefix,
      is_internal: ctx.isInternal ? 1 : 0,
      country: ctx.geo.country,
      region: ctx.geo.region,
      city: ctx.geo.city,
      asn_org: ctx.geo.asnOrg,
      utm_source: stamp?.utm_source ?? null,
      utm_medium: stamp?.utm_medium ?? null,
      utm_campaign: stamp?.utm_campaign ?? null,
      utm_content: stamp?.utm_content ?? null,
      utm_term: stamp?.utm_term ?? null,
      click_id: stamp?.click_id ?? null,
      click_id_source: stamp?.click_id_source ?? null,
      landing_path: stamp?.landing_path ?? null,
      created_at: ctx.now,
    });

    if (e.point) {
      pointRows.push({
        session_id: ctx.sessionId,
        path: e.path,
        section: e.section,
        mode: e.mode,
        // The band the heatmap will bucket this into. Derived from the
        // viewport when we have it, because the canvas renders at a fixed
        // device width and the coordinate space has to match.
        device: viewportClass(e.viewport_w, ctx.ua.device),
        viewport_w: e.viewport_w,
        viewport_h: e.viewport_h,
        x_pct: e.point.x_pct,
        y_pct: e.point.y_pct,
        doc_h: e.point.doc_h,
        selector: e.point.selector,
        kind: e.point.kind,
        is_internal: ctx.isInternal ? 1 : 0,
        created_at: ctx.now,
      });
    }
  }

  return { eventRows, pointRows };
}

const EVENT_COLUMNS = [
  'session_id', 'visitor_id', 'event', 'path', 'section', 'mode', 'referrer',
  'referrer_host', 'props', 'viewport_w', 'viewport_h', 'device', 'browser',
  'os', 'duration_ms', 'seq', 'ip_hash', 'ip_prefix', 'is_internal',
  'country', 'region', 'city', 'asn_org', 'utm_source', 'utm_medium',
  'utm_campaign', 'utm_content', 'utm_term', 'click_id', 'click_id_source',
  'landing_path', 'created_at',
] as const;

const POINT_COLUMNS = [
  'session_id', 'path', 'section', 'mode', 'device', 'viewport_w',
  'viewport_h', 'x_pct', 'y_pct', 'doc_h', 'selector', 'kind', 'is_internal',
  'created_at',
] as const;

/** `INSERT … SELECT json_extract(...) FROM json_each(?1)` for one table. */
function insertFromJson(
  table: string,
  columns: readonly string[],
): string {
  const extracts = columns
    .map((c) => `json_extract(value, '$.${c}')`)
    .join(', ');
  return (
    `INSERT INTO ${table} (${columns.join(', ')})\n` +
    ` SELECT ${extracts} FROM json_each(?1)`
  );
}

/** 120 events per address per minute, charged per event before any work. */
export const EVENTS_PER_MINUTE = 120;

/**
 * Charge the budget and report whether this request may proceed.
 *
 * `limit` is a parameter because /api/chat shares this table with a much
 * tighter allowance. See chat-limit.ts. The bucket keys are namespaced, so
 * the two callers cannot spend each other's budget.
 *
 * ── Being honest about what this does and does not do ──────────────────────
 * An in-memory Map does not work on Workers: isolates are created and
 * destroyed per colo per burst, two requests from one address routinely land
 * in different isolates, and an isolate can be evicted between them.
 * Lumen's Map is a per-isolate speed bump there too, the difference is
 * that Deno Deploy isolates live long enough for it to mostly work.
 *
 * A D1 counter is durable across isolates, which is the property that matters.
 * The residual, stated plainly: an attacker still forces one D1 write per
 * request, because the counter must be written to be read. The only real fix
 * is an edge rate limit, and `.openai/hosting.json` expresses only `d1` and
 * `r2`: the runtime supports a `ratelimits` binding but we cannot add one.
 *
 * What bounds the damage instead: the 32 KB body cap, the 50-event batch cap,
 * and the hard rule in the route that no ip_hash means no write at all.
 */
export async function chargeBudget(
  db: D1Database,
  bucket: string,
  count: number,
  now: number,
  limit: number = EVENTS_PER_MINUTE,
): Promise<{ allowed: boolean; used: number }> {
  const windowStart = Math.floor(now / 60_000) * 60_000;

  const row = await db
    .prepare(
      `INSERT INTO ingest_budget (bucket, window_start, events)
            VALUES (?1, ?2, ?3)
       ON CONFLICT(bucket) DO UPDATE SET
         events = CASE
                    WHEN ingest_budget.window_start = excluded.window_start
                      THEN ingest_budget.events + excluded.events
                    ELSE excluded.events
                  END,
         window_start = excluded.window_start
       RETURNING events`,
    )
    .bind(bucket, windowStart, count)
    .first<{ events: number }>();

  const used = row?.events ?? count;
  return { allowed: used <= limit, used };
}

/** One batch, one round trip, one transaction. */
export async function writeBatch(
  db: D1Database,
  eventRows: readonly EventRow[],
  pointRows: readonly PointRow[],
): Promise<void> {
  const statements: D1PreparedStatement[] = [];

  if (eventRows.length > 0) {
    statements.push(
      db
        .prepare(insertFromJson('events', EVENT_COLUMNS))
        .bind(JSON.stringify(eventRows)),
    );
  }
  if (pointRows.length > 0) {
    statements.push(
      db
        .prepare(insertFromJson('click_points', POINT_COLUMNS))
        .bind(JSON.stringify(pointRows)),
    );
  }
  if (statements.length > 0) await db.batch(statements);
}
