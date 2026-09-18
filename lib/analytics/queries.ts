/**
 * Every aggregation. One db.batch() per action, mapped positionally.
 *
 * batch() runs its statements in a single transaction, so each panel reads a
 * consistent snapshot, the property Lumen got from one big SQL function.
 *
 * Contract inherited from the source system and worth restating: **never
 * return a zeroed payload on failure.** An empty funnel and a broken endpoint
 * look identical, and only one of them means nobody visited. Errors propagate
 * to the route, which reports them; they are not swallowed into zeros here.
 */

import {
  DAY_GRID,
  EV_CTE,
  IST_DAY,
  SESS_CTE,
  WITH_EV,
  WITH_SESS,
  medianOf,
  prop,
} from './sql';
import { RETENTION_DAYS } from './schema';
import { resolveSource } from './sources';
import { TZ_LABEL, type Window } from './time';
import type {
  Audience,
  Breakdown,
  Campaigns,
  ChatStats,
  ClickMap,
  InternalNotice,
  Overview,
  RangeMeta,
  SessionRow,
} from './types';

export interface QueryOptions {
  window: Window;
  excludeInternal: boolean;
  cidrsActive?: number;
  visitorsActive?: number;
}

type Row = Record<string, unknown>;

function rows(results: D1Result<Row>[], i: number): Row[] {
  return (results[i]?.results ?? []) as Row[];
}
function one(results: D1Result<Row>[], i: number): Row {
  return rows(results, i)[0] ?? {};
}
function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function meta(o: QueryOptions): RangeMeta {
  return {
    window: o.window,
    timezone: TZ_LABEL as 'IST',
    generatedAt: Date.now(),
    retentionDays: RETENTION_DAYS.events,
  };
}

/** Share of a total, as a percentage with one decimal. */
function share(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function toBreakdown(list: Row[], total: number): Breakdown[] {
  return list.map((r) => ({
    label: str(r.label) ?? '(unknown)',
    sessions: num(r.sessions),
    share: share(num(r.sessions), total),
  }));
}

/** ?1/?2/?3, the window and the internal-filter switch. */
function bind(o: QueryOptions): [number, number, number] {
  return [o.window.since, o.window.until, o.excludeInternal ? 1 : 0];
}

async function internalNotice(
  db: D1Database,
  o: QueryOptions,
): Promise<InternalNotice> {
  const [since, until] = bind(o);
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT session_id FROM events
          WHERE created_at >= ?1 AND created_at <= ?2
          GROUP BY session_id HAVING MAX(is_internal) = 1)`,
    )
    .bind(since, until)
    .first<{ n: number }>();

  return {
    excluded: o.excludeInternal,
    sessionsMatched: num(row?.n),
    cidrsActive: o.cidrsActive ?? 0,
    visitorsActive: o.visitorsActive ?? 0,
  };
}

/* ────────────────────────────────  overview  ─────────────────────────────── */

export async function overview(
  db: D1Database,
  o: QueryOptions,
): Promise<Overview> {
  const p = bind(o);
  const q = (sql: string) => db.prepare(sql).bind(...p);

  const results = await db.batch<Row>([
    // 0, funnel
    q(`${WITH_SESS}
       SELECT COUNT(*) AS sessions,
              SUM(CASE WHEN section_views > 1 OR duration_ms >= 10000
                       THEN 1 ELSE 0 END) AS engaged,
              SUM(saw_immersive) AS saw_immersive,
              SUM(did_chat) AS chat_opened,
              SUM(did_ask) AS chat_asked,
              SUM(CASE WHEN did_contact = 1 OR did_resume = 1
                        OR did_outbound = 1 THEN 1 ELSE 0 END) AS reached_out
         FROM sess`),

    // 1, engagement, including two medians
    q(`${WITH_SESS}
       SELECT COUNT(*) AS sessions,
              ROUND(COALESCE(AVG(duration_ms), 0) / 1000.0, 1) AS avg_seconds,
              ROUND(COALESCE(${medianOf('sess', 'duration_ms')}, 0) / 1000.0, 1)
                AS median_seconds,
              ROUND(100.0 * SUM(CASE WHEN section_views <= 1 THEN 1 ELSE 0 END)
                    / MAX(COUNT(*), 1), 1) AS shallow_pct,
              ROUND(COALESCE(AVG(section_views), 0), 2) AS sections_per_session,
              COALESCE(${medianOf('sess', 'max_scroll_px')}, 0) AS median_scroll_px
         FROM sess`),

    // 2, sections and where people leave. Dwell belongs to the row that
    //     names it, because page_view is emitted on LEAVE (see sections.ts),
    //     so this needs no window function at all.
    q(`${WITH_EV}
       SELECT path,
              COUNT(*) AS views,
              COUNT(DISTINCT session_id) AS sessions,
              ROUND(COALESCE(AVG(duration_ms), 0) / 1000.0, 1) AS avg_seconds,
              SUM(CASE WHEN ${prop('terminal')} = 1 THEN 1 ELSE 0 END) AS exits,
              ROUND(100.0 * SUM(CASE WHEN ${prop('terminal')} = 1 THEN 1 ELSE 0 END)
                    / MAX(COUNT(*), 1), 1) AS exit_pct
         FROM ev
        WHERE event = 'page_view' AND path IS NOT NULL
        GROUP BY path
        ORDER BY views DESC
        LIMIT 50`),

    // 3, what gets clicked
    q(`${WITH_EV}
       SELECT COALESCE(${prop('tag')}, ${prop('selector')}, '(unidentified)')
                AS label,
              CASE WHEN ${prop('tag')} IS NOT NULL THEN 1 ELSE 0 END AS tagged,
              section,
              COUNT(*) AS clicks,
              COUNT(DISTINCT session_id) AS sessions
         FROM ev
        WHERE event = 'click'
        GROUP BY label, tagged, section
        ORDER BY clicks DESC
        LIMIT 50`),

    // 4, scroll reach. The denominator is sessions that STARTED, not sessions
    //     that reported a milestone: scoping to reporters divides by only the
    //     people who scrolled and puts every depth at ~100%, which says the
    //     opposite of the truth.
    q(`${WITH_EV}, starts AS (
         SELECT COUNT(DISTINCT session_id) AS n FROM ev WHERE event = 'visit')
       SELECT (SELECT n FROM starts) AS sessions,
              COUNT(DISTINCT CASE WHEN d >= 25  THEN session_id END) AS d25,
              COUNT(DISTINCT CASE WHEN d >= 50  THEN session_id END) AS d50,
              COUNT(DISTINCT CASE WHEN d >= 75  THEN session_id END) AS d75,
              COUNT(DISTINCT CASE WHEN d >= 100 THEN session_id END) AS d100
         FROM (SELECT session_id, CAST(${prop('depth')} AS INTEGER) AS d
                 FROM ev WHERE event = 'scroll_depth')`),

    // 5, CTA seen vs clicked. FULL OUTER JOIN replaced by a key set.
    q(`${WITH_EV}, tags AS (
         SELECT DISTINCT ${prop('tag')} AS tag FROM ev
          WHERE event IN ('cta_view','click') AND ${prop('tag')} IS NOT NULL),
       seen AS (
         SELECT ${prop('tag')} AS tag, COUNT(DISTINCT session_id) AS sessions
           FROM ev WHERE event = 'cta_view' AND ${prop('tag')} IS NOT NULL
          GROUP BY 1),
       hit AS (
         SELECT ${prop('tag')} AS tag, COUNT(*) AS clicks,
                COUNT(DISTINCT session_id) AS sessions
           FROM ev WHERE event = 'click' AND ${prop('tag')} IS NOT NULL
          GROUP BY 1)
       SELECT t.tag,
              COALESCE(s.sessions, 0) AS seen_sessions,
              COALESCE(h.clicks, 0)   AS clicks,
              COALESCE(h.sessions, 0) AS clicked_sessions,
              -- NULL, not 0.0, when nothing was ever seen: printing 0% would
              -- claim the control was shown and ignored.
              CASE WHEN COALESCE(s.sessions, 0) > 0
                   THEN ROUND(100.0 * COALESCE(h.sessions, 0) / s.sessions, 1)
              END AS ctr
         FROM tags t
         LEFT JOIN seen s ON s.tag = t.tag
         LEFT JOIN hit  h ON h.tag = t.tag
        ORDER BY seen_sessions DESC, clicks DESC
        LIMIT 50`),

    // 6, friction. Grouped by section, because "somewhere on the page" is not
    //     actionable on a page this tall.
    q(`${WITH_EV}
       SELECT CASE event WHEN 'dead_click' THEN 'dead' ELSE 'rage' END AS kind,
              section,
              ${prop('selector')} AS selector,
              COUNT(*) AS events,
              COUNT(DISTINCT session_id) AS sessions
         FROM ev
        WHERE event IN ('dead_click','rage_click')
        GROUP BY kind, section, selector
        ORDER BY events DESC
        LIMIT 50`),

    // 7, last click before leaving, split by whether the session then
    //     reached out. Without the split the dead end and the win rank alike.
    q(`${WITH_EV}, ${SESS_CTE}, ranked AS (
         SELECT session_id,
                COALESCE(${prop('tag')}, ${prop('selector')}, '(unidentified)')
                  AS label,
                section,
                ROW_NUMBER() OVER (PARTITION BY session_id
                  ORDER BY created_at DESC, COALESCE(seq, id) DESC) AS rn
           FROM ev WHERE event = 'click')
       SELECT r.label, r.section,
              COUNT(*) AS sessions,
              SUM(CASE WHEN s.did_contact = 1 OR s.did_resume = 1
                        OR s.did_outbound = 1 THEN 1 ELSE 0 END) AS converted
         FROM ranked r JOIN sess s ON s.session_id = r.session_id
        WHERE r.rn = 1
        GROUP BY r.label, r.section
        ORDER BY sessions DESC
        LIMIT 25`),

    // 8/9/10: devices, browsers, referrer sources
    q(`${WITH_SESS}
       SELECT COALESCE(device,'(unknown)') AS label, COUNT(*) AS sessions
         FROM sess GROUP BY 1 ORDER BY sessions DESC`),
    q(`${WITH_SESS}
       SELECT COALESCE(browser,'(unknown)') AS label, COUNT(*) AS sessions
         FROM sess GROUP BY 1 ORDER BY sessions DESC`),
    q(`${WITH_SESS}
       SELECT COALESCE(referrer_host,'(direct)') AS label, COUNT(*) AS sessions
         FROM sess GROUP BY 1 ORDER BY sessions DESC LIMIT 25`),

    // 11, daily series over a day grid, so a quiet day is an explicit 0
    q(`WITH RECURSIVE ${DAY_GRID}, ${EV_CTE}, ${SESS_CTE},
       s AS (SELECT ${IST_DAY('first_seen')} AS day, COUNT(*) n
               FROM sess GROUP BY 1),
       v AS (SELECT ${IST_DAY('created_at')} AS day, COUNT(*) n
               FROM ev WHERE event = 'page_view' GROUP BY 1),
       c AS (SELECT ${IST_DAY('created_at')} AS day, COUNT(*) n
               FROM ev WHERE event = 'chat_ask' GROUP BY 1)
       SELECT d.day,
              COALESCE(s.n,0) AS sessions,
              COALESCE(v.n,0) AS section_views,
              COALESCE(c.n,0) AS chat_questions
         FROM days d
         LEFT JOIN s ON s.day = d.day
         LEFT JOIN v ON v.day = d.day
         LEFT JOIN c ON c.day = d.day
        ORDER BY d.day`),

    // 12, résumé vs immersive. Does the 3D view hold people longer?
    q(`${WITH_SESS}
       SELECT CASE WHEN saw_immersive = 1 THEN 'immersive' ELSE 'resume' END
                AS mode,
              COUNT(*) AS sessions,
              ROUND(COALESCE(AVG(duration_ms),0) / 1000.0, 1) AS avg_seconds,
              ROUND(COALESCE(AVG(section_views),0), 2) AS avg_sections
         FROM sess GROUP BY 1`),
  ]);

  const f = one(results, 0);
  const e = one(results, 1);
  const sessions = num(e.sessions);

  return {
    meta: meta(o),
    internal: await internalNotice(db, o),
    funnel: {
      sessions: num(f.sessions),
      engaged: num(f.engaged),
      sawImmersive: num(f.saw_immersive),
      chatOpened: num(f.chat_opened),
      chatAsked: num(f.chat_asked),
      reachedOut: num(f.reached_out),
    },
    engagement: {
      sessions,
      avgSeconds: num(e.avg_seconds),
      medianSeconds: num(e.median_seconds),
      shallowPct: num(e.shallow_pct),
      sectionsPerSession: num(e.sections_per_session),
      medianScrollPx: Math.round(num(e.median_scroll_px)),
    },
    sections: rows(results, 2).map((r) => ({
      path: str(r.path) ?? '/',
      views: num(r.views),
      sessions: num(r.sessions),
      avgSeconds: num(r.avg_seconds),
      exits: num(r.exits),
      exitPct: num(r.exit_pct),
    })),
    clicks: rows(results, 3).map((r) => ({
      label: str(r.label) ?? '(unidentified)',
      tagged: num(r.tagged) === 1,
      section: str(r.section),
      clicks: num(r.clicks),
      sessions: num(r.sessions),
    })),
    scroll: (() => {
      const s = one(results, 4);
      return {
        sessions: num(s.sessions),
        d25: num(s.d25),
        d50: num(s.d50),
        d75: num(s.d75),
        d100: num(s.d100),
      };
    })(),
    ctas: rows(results, 5).map((r) => ({
      tag: str(r.tag) ?? '(unnamed)',
      seenSessions: num(r.seen_sessions),
      clicks: num(r.clicks),
      clickedSessions: num(r.clicked_sessions),
      ctr: r.ctr === null || r.ctr === undefined ? null : num(r.ctr),
    })),
    friction: rows(results, 6).map((r) => ({
      kind: str(r.kind) === 'dead' ? 'dead' : 'rage',
      section: str(r.section),
      selector: str(r.selector),
      events: num(r.events),
      sessions: num(r.sessions),
    })),
    exitClicks: rows(results, 7).map((r) => ({
      label: str(r.label) ?? '(unidentified)',
      section: str(r.section),
      sessions: num(r.sessions),
      converted: num(r.converted),
    })),
    devices: toBreakdown(rows(results, 8), sessions),
    browsers: toBreakdown(rows(results, 9), sessions),
    sources: toBreakdown(rows(results, 10), sessions),
    daily: rows(results, 11).map((r) => ({
      day: str(r.day) ?? '',
      sessions: num(r.sessions),
      sectionViews: num(r.section_views),
      chatQuestions: num(r.chat_questions),
    })),
    modes: rows(results, 12).map((r) => ({
      mode: str(r.mode) ?? 'resume',
      sessions: num(r.sessions),
      avgSeconds: num(r.avg_seconds),
      avgSections: num(r.avg_sections),
    })),
  };
}

/* ────────────────────────────────  audience  ─────────────────────────────── */

export async function audience(
  db: D1Database,
  o: QueryOptions,
): Promise<Audience> {
  const p = bind(o);
  const q = (sql: string) => db.prepare(sql).bind(...p);

  const results = await db.batch<Row>([
    // 0, new vs returning. The correlated EXISTS deliberately reads OUTSIDE
    //     the window, which is why the retention horizon is reported next to
    //     it: a visitor last seen 200 days ago now looks new.
    q(`${WITH_SESS}, visitors AS (
         SELECT DISTINCT visitor_id FROM sess WHERE visitor_id IS NOT NULL)
       SELECT
         SUM(CASE WHEN EXISTS (SELECT 1 FROM events pe
                                WHERE pe.visitor_id = v.visitor_id
                                  AND pe.created_at < ?1)
                  THEN 1 ELSE 0 END) AS returning_v,
         SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM events pe
                                    WHERE pe.visitor_id = v.visitor_id
                                      AND pe.created_at < ?1)
                  THEN 1 ELSE 0 END) AS new_v,
         (SELECT COUNT(*) FROM sess WHERE visitor_id IS NULL) AS unknown_v
         FROM visitors v`),

    // 1, engagement rate. Same threshold as the source system, adapted
    //     denominator (section views instead of page views).
    q(`${WITH_SESS}
       SELECT COUNT(*) AS sessions,
              SUM(CASE WHEN section_views > 1 OR duration_ms >= 10000
                       THEN 1 ELSE 0 END) AS engaged
         FROM sess`),

    q(`${WITH_SESS}
       SELECT COALESCE(device,'(unknown)') AS label, COUNT(*) AS sessions
         FROM sess GROUP BY 1 ORDER BY sessions DESC`),
    q(`${WITH_SESS}
       SELECT COALESCE(os,'(unknown)') AS label, COUNT(*) AS sessions
         FROM sess GROUP BY 1 ORDER BY sessions DESC`),

    // 4, cities. Region carried alongside because two states share city
    //     names and "Thane" alone means little.
    q(`${WITH_SESS}
       SELECT city, region, country, COUNT(*) AS sessions
         FROM sess WHERE city IS NOT NULL
        GROUP BY city, region, country ORDER BY sessions DESC LIMIT 25`),

    // 5, the raw ingredients for the source ladder; precedence is applied in
    //     TS by resolveSource(), where the ad-before-referrer order lives.
    q(`${WITH_SESS}
       SELECT utm_source, utm_medium, click_id_source, referrer_host,
              COUNT(*) AS sessions
         FROM sess
        GROUP BY utm_source, utm_medium, click_id_source, referrer_host
        ORDER BY sessions DESC LIMIT 50`),

    // 6, is geo present at all? Read from the data, never assumed.
    q(`${WITH_SESS}
       SELECT COUNT(*) AS geo_sessions FROM sess WHERE city IS NOT NULL`),
  ]);

  const v = one(results, 0);
  const eng = one(results, 1);
  const sessions = num(eng.sessions);
  const geoSessions = num(one(results, 6).geo_sessions);

  return {
    meta: meta(o),
    internal: await internalNotice(db, o),
    visitors: {
      new: num(v.new_v),
      returning: num(v.returning_v),
      unknown: num(v.unknown_v),
    },
    engagementRate: share(num(eng.engaged), sessions),
    devices: toBreakdown(rows(results, 2), sessions),
    os: toBreakdown(rows(results, 3), sessions),
    cities: rows(results, 4).map((r) => ({
      city: str(r.city) ?? '(unknown)',
      region: str(r.region),
      country: str(r.country),
      sessions: num(r.sessions),
    })),
    sourceMedium: rows(results, 5).map((r) => {
      const resolved = resolveSource({
        utm_source: str(r.utm_source),
        utm_medium: str(r.utm_medium),
        click_id_source: str(r.click_id_source),
        referrer_host: str(r.referrer_host),
      });
      return {
        source: resolved.source,
        medium: resolved.medium,
        tagged: resolved.tagged,
        sessions: num(r.sessions),
      };
    }),
    geoAvailable: geoSessions > 0,
    geoSessions,
  };
}

/* ────────────────────────────────  campaigns  ────────────────────────────── */

export async function campaigns(
  db: D1Database,
  o: QueryOptions,
): Promise<Campaigns> {
  const p = bind(o);
  const q = (sql: string) => db.prepare(sql).bind(...p);

  const results = await db.batch<Row>([
    // `content` stays a GROUPING key rather than a picked column: a campaign
    // is usually several creatives, and "which creative worked" is the point.
    q(`${WITH_SESS}
       SELECT utm_source AS source, utm_medium AS medium,
              utm_campaign AS campaign, utm_content AS content,
              COUNT(*) AS sessions,
              SUM(did_ask) AS chat_asked,
              SUM(CASE WHEN did_contact = 1 OR did_resume = 1
                        OR did_outbound = 1 THEN 1 ELSE 0 END) AS reached_out
         FROM sess
        WHERE utm_source IS NOT NULL OR utm_campaign IS NOT NULL
              OR click_id_source IS NOT NULL
        GROUP BY source, medium, campaign, content
        ORDER BY sessions DESC LIMIT 50`),
    q(`${WITH_SESS}
       SELECT
         SUM(CASE WHEN utm_source IS NOT NULL OR utm_campaign IS NOT NULL
                   OR click_id_source IS NOT NULL THEN 1 ELSE 0 END) AS tagged,
         SUM(CASE WHEN utm_source IS NULL AND utm_campaign IS NULL
                   AND click_id_source IS NULL THEN 1 ELSE 0 END) AS untagged
         FROM sess`),
  ]);

  const t = one(results, 1);
  return {
    meta: meta(o),
    internal: await internalNotice(db, o),
    campaigns: rows(results, 0).map((r) => ({
      source: str(r.source),
      medium: str(r.medium),
      campaign: str(r.campaign),
      content: str(r.content),
      sessions: num(r.sessions),
      chatAsked: num(r.chat_asked),
      reachedOut: num(r.reached_out),
    })),
    totals: { tagged: num(t.tagged), untagged: num(t.untagged) },
  };
}

/* ────────────────────────────────  chat  ─────────────────────────────────── */

/** The greeting's pseudo-source, which is not a real answer. */
const SEED_SOURCE = 'Answers from the portfolio';
/**
 * Every source content/faq.ts returns without reaching the answer set.
 *
 * Exact strings, matched in SQL, a source missing from this list is counted
 * as an answer rather than a guard hit, which understates guardHitPct and
 * leaves an unexplained bucket in the source distribution. 'Out of scope' is
 * the personal-information boundary; it arrived with guard.personal and has to
 * be named here for the same reason the other two are.
 */
const GUARD_SOURCES = ['Safety boundary', 'Portfolio guide', 'Out of scope'];

export async function chatStats(
  db: D1Database,
  o: QueryOptions,
): Promise<ChatStats> {
  const p = bind(o);
  const q = (sql: string) => db.prepare(sql).bind(...p);

  const results = await db.batch<Row>([
    q(`${WITH_EV}
       SELECT
         SUM(CASE WHEN event = 'chat_ask'    THEN 1 ELSE 0 END) AS asked,
         SUM(CASE WHEN event = 'chat_answer' THEN 1 ELSE 0 END) AS answered,
         SUM(CASE WHEN event = 'chat_open'   THEN 1 ELSE 0 END) AS opened,
         SUM(CASE WHEN event = 'chat_close' AND ${prop('asked')} = 0
                  THEN 1 ELSE 0 END) AS abandoned
         FROM ev`),

    // Source distribution. The seed greeting is excluded explicitly, or the
    // chart gains a phantom bucket equal to the number of panels opened.
    q(`${WITH_EV}
       SELECT ${prop('source')} AS label, COUNT(*) AS sessions
         FROM ev
        WHERE event = 'chat_answer' AND ${prop('source')} IS NOT NULL
              AND ${prop('source')} != '${SEED_SOURCE}'
        GROUP BY 1 ORDER BY sessions DESC`),

    q(`${WITH_EV}
       SELECT ${prop('failure')} AS label, COUNT(*) AS sessions
         FROM ev
        WHERE event = 'chat_answer' AND ${prop('failure')} IS NOT NULL
        GROUP BY 1 ORDER BY sessions DESC`),

    // How often the PII/URL/length screen refused text. A privacy metric in
    // its own right, and the reason rejecting text never rejects the event.
    q(`${WITH_EV}
       SELECT ${prop('rejected')} AS label, COUNT(*) AS sessions
         FROM ev
        WHERE event = 'chat_ask' AND ${prop('rejected')} IS NOT NULL
        GROUP BY 1 ORDER BY sessions DESC`),

    q(`${WITH_EV}, asks AS (
         SELECT ${prop('q')} AS question FROM ev
          WHERE event = 'chat_ask' AND ${prop('q')} IS NOT NULL)
       SELECT question, COUNT(*) AS asks, 0 AS matched
         FROM asks GROUP BY question ORDER BY asks DESC LIMIT 25`),

    // The actionable list: every row is a question content/faq.ts does not
    // answer. Joined on session+turn so an ask is paired with its own answer.
    q(`${WITH_EV}, pairs AS (
         SELECT a.session_id,
                ${prop('q')} AS question,
                (SELECT ${prop('source')} FROM ev b
                  WHERE b.session_id = a.session_id
                    AND b.event = 'chat_answer'
                    AND ${prop('turn')} = json_extract(a.props, '$.turn')
                  LIMIT 1) AS source
           FROM ev a
          WHERE a.event = 'chat_ask' AND ${prop('q')} IS NOT NULL)
       SELECT question, COUNT(*) AS asks
         FROM pairs WHERE source = 'Not documented'
        GROUP BY question ORDER BY asks DESC LIMIT 25`),

    q(`WITH RECURSIVE ${DAY_GRID}, ${EV_CTE},
       a AS (SELECT ${IST_DAY('created_at')} AS day, COUNT(*) n
               FROM ev WHERE event = 'chat_ask' GROUP BY 1),
       u AS (SELECT ${IST_DAY('created_at')} AS day, COUNT(*) n
               FROM ev WHERE event = 'chat_answer'
                 AND ${prop('source')} = 'Not documented' GROUP BY 1)
       SELECT d.day, COALESCE(a.n,0) AS asked, COALESCE(u.n,0) AS unmatched
         FROM days d LEFT JOIN a ON a.day = d.day LEFT JOIN u ON u.day = d.day
        ORDER BY d.day`),

    q(`${WITH_EV}
       SELECT COUNT(*) AS n,
              SUM(CASE WHEN ${prop('source')} = 'Not documented'
                       THEN 1 ELSE 0 END) AS gap,
              SUM(CASE WHEN ${prop('source')} IN (${GUARD_SOURCES.map((s) => `'${s}'`).join(', ')})
                       THEN 1 ELSE 0 END) AS guard,
              SUM(CASE WHEN ${prop('offline')} = 1 THEN 1 ELSE 0 END) AS offline
         FROM ev WHERE event = 'chat_answer'`),
  ]);

  // Latency median needs its own statement shape; run it separately rather
  // than contorting the batch.
  const latency = await db
    .prepare(
      `WITH ${EV_CTE}, lat AS (
         SELECT CAST(${prop('latency_ms')} AS INTEGER) AS ms FROM ev
          WHERE event = 'chat_answer' AND ${prop('latency_ms')} IS NOT NULL)
       SELECT COALESCE(${medianOf('lat', 'ms')}, 0) AS median_ms`,
    )
    .bind(...p)
    .first<{ median_ms: number }>();

  const backend = await db
    .prepare(
      `SELECT day, requests, backend_ok, backend_fail
         FROM chat_health
        WHERE day >= ${IST_DAY('?1')} AND day <= ${IST_DAY('?2')}
        ORDER BY day`,
    )
    .bind(o.window.since, o.window.until)
    .all<Row>();

  const head = one(results, 0);
  const r = one(results, 7);
  const answers = num(r.n);

  return {
    meta: meta(o),
    internal: await internalNotice(db, o),
    asked: num(head.asked),
    answered: num(head.answered),
    opened: num(head.opened),
    abandoned: num(head.abandoned),
    coverageGapPct: share(num(r.gap), answers),
    guardHitPct: share(num(r.guard), answers),
    offlinePct: share(num(r.offline), answers),
    medianLatencyMs: Math.round(num(latency?.median_ms)),
    sources: toBreakdown(rows(results, 1), answers),
    failures: toBreakdown(rows(results, 2), answers),
    rejections: toBreakdown(rows(results, 3), num(head.asked)),
    topQuestions: rows(results, 4).map((x) => ({
      question: str(x.question) ?? '',
      asks: num(x.asks),
      matched: num(x.matched),
    })),
    unmatchedQuestions: rows(results, 5).map((x) => ({
      question: str(x.question) ?? '',
      asks: num(x.asks),
    })),
    daily: rows(results, 6).map((x) => ({
      day: str(x.day) ?? '',
      asked: num(x.asked),
      unmatched: num(x.unmatched),
    })),
    backend: (backend.results ?? []).map((x) => ({
      day: str(x.day) ?? '',
      requests: num(x.requests),
      backendOk: num(x.backend_ok),
      backendFail: num(x.backend_fail),
    })),
    questionTextRetentionDays: RETENTION_DAYS.questionText,
  };
}

/* ────────────────────────────────  heatmap  ──────────────────────────────── */

export async function clickMap(
  db: D1Database,
  o: QueryOptions & {
    kind: 'click' | 'dead' | 'rage';
    device: string | null;
    mode: string | null;
  },
): Promise<ClickMap> {
  const [since, until, excl] = bind(o);

  const row = await db
    .prepare(
      `WITH ${EV_CTE},
       sampled AS (
         SELECT x_pct, y_pct, doc_h, device, mode FROM click_points
          WHERE created_at >= ?1 AND created_at <= ?2
            AND kind = ?4
            AND (?5 IS NULL OR device = ?5)
            AND (?6 IS NULL OR mode = ?6)
            AND (?3 = 0
                 OR session_id NOT IN (SELECT session_id FROM internal_sessions))
       ),
       -- percentile_disc(0.5): a REAL observed height, not an average of two
       -- heights no visitor had. 0 when nothing carries one -> fraction mode.
       ranked AS (SELECT doc_h, ROW_NUMBER() OVER (ORDER BY doc_h) rn,
                         COUNT(*) OVER () n
                    FROM sampled WHERE doc_h IS NOT NULL),
       ref AS (SELECT COALESCE(
                 (SELECT doc_h FROM ranked WHERE rn = (n + 1) / 2), 0) AS ref_h),
       pts AS (
         SELECT MIN(CAST(x_pct * 40 AS INTEGER), 39) AS cx,
                CASE WHEN (SELECT ref_h FROM ref) > 0
                     -- Absolute 24px bands, NOT 40 y-buckets: on a 13,000px
                     -- page a 40-bucket grid is 325px a band, and the renderer
                     -- paints an 18px blob in the whitespace above the button.
                     THEN MIN(CAST(y_pct * COALESCE(doc_h,
                            (SELECT ref_h FROM ref)) / 24.0 AS INTEGER), 1666)
                     ELSE MIN(CAST(y_pct * 200 AS INTEGER), 199) END AS cy
           FROM sampled)
       SELECT (SELECT ref_h FROM ref) AS ref_h,
              (SELECT COUNT(*) FROM sampled) AS total,
              (SELECT COUNT(*) FROM sampled WHERE device IS NULL)
                AS unclassified,
              (SELECT COUNT(*) FROM sampled
                WHERE ?6 IS NOT NULL AND mode IS NOT NULL AND mode != ?6)
                AS other_mode`,
    )
    .bind(since, until, excl, o.kind, o.device, o.mode)
    .first<Row>();

  const cells = await db
    .prepare(
      `WITH ${EV_CTE},
       sampled AS (
         SELECT x_pct, y_pct, doc_h FROM click_points
          WHERE created_at >= ?1 AND created_at <= ?2
            AND kind = ?4
            AND (?5 IS NULL OR device = ?5)
            AND (?6 IS NULL OR mode = ?6)
            AND (?3 = 0
                 OR session_id NOT IN (SELECT session_id FROM internal_sessions))
       ),
       ranked AS (SELECT doc_h, ROW_NUMBER() OVER (ORDER BY doc_h) rn,
                         COUNT(*) OVER () n
                    FROM sampled WHERE doc_h IS NOT NULL),
       ref AS (SELECT COALESCE(
                 (SELECT doc_h FROM ranked WHERE rn = (n + 1) / 2), 0) AS ref_h),
       pts AS (
         SELECT MIN(CAST(x_pct * 40 AS INTEGER), 39) AS cx,
                CASE WHEN (SELECT ref_h FROM ref) > 0
                     THEN MIN(CAST(y_pct * COALESCE(doc_h,
                            (SELECT ref_h FROM ref)) / 24.0 AS INTEGER), 1666)
                     ELSE MIN(CAST(y_pct * 200 AS INTEGER), 199) END AS cy
           FROM sampled)
       SELECT cx, cy, COUNT(*) AS n FROM pts
        GROUP BY cx, cy ORDER BY n DESC LIMIT 4000`,
    )
    .bind(since, until, excl, o.kind, o.device, o.mode)
    .all<Row>();

  const list = (cells.results ?? []).map((c) => ({
    x: num(c.cx),
    y: num(c.cy),
    n: num(c.n),
  }));

  const total = num(row?.total);
  return {
    meta: meta(o),
    kind: o.kind,
    device: o.device,
    mode: o.mode,
    total,
    medianDocH: Math.round(num(row?.ref_h)),
    cells: list,
    maxN: list.reduce((m, c) => Math.max(m, c.n), 0),
    unclassified: num(row?.unclassified),
    otherModeShare: share(num(row?.other_mode), total),
  };
}

/* ────────────────────────────────  sessions  ─────────────────────────────── */

export async function listSessions(
  db: D1Database,
  o: QueryOptions & { limit: number },
): Promise<SessionRow[]> {
  const [since, until, excl] = bind(o);
  const result = await db
    .prepare(
      `${WITH_EV}, ${SESS_CTE}
       SELECT s.*,
              (SELECT COUNT(*) FROM ev e WHERE e.session_id = s.session_id)
                AS event_count,
              (SELECT GROUP_CONCAT(DISTINCT e.event) FROM ev e
                WHERE e.session_id = s.session_id) AS verbs,
              (SELECT MAX(is_internal) FROM events x
                WHERE x.session_id = s.session_id) AS internal
         FROM sess s
        ORDER BY s.last_seen DESC
        LIMIT ?4`,
    )
    // Clamped at BOTH ends: SQLite reads a negative LIMIT as unbounded, so a
    // `Math.min` alone turns `limit: -1` into a whole-table dump.
    .bind(since, until, excl, Math.max(1, Math.min(Math.floor(o.limit), 200)))
    .all<Row>();

  return (result.results ?? []).map((r) => ({
    sessionId: str(r.session_id) ?? '',
    firstSeen: num(r.first_seen),
    lastSeen: num(r.last_seen),
    events: num(r.event_count),
    device: str(r.device),
    browser: str(r.browser),
    os: str(r.os),
    city: str(r.city),
    country: str(r.country),
    asnOrg: str(r.asn_org),
    ipPrefix: str(r.ip_prefix),
    isInternal: num(r.internal) === 1,
    verbs: str(r.verbs),
  }));
}
