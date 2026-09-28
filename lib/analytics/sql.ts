/**
 * Composed SQL fragments.
 *
 * Lumen got its one-round-trip property from a single 600-line
 * `language sql` function returning jsonb. The D1 equivalent is one
 * `db.batch()` of independent SELECTs mapped positionally into the payload, 
 * batch() runs them in one transaction, so the dashboard reads a consistent
 * snapshot, which is what you want.
 *
 * CTEs cannot be shared across statements and `CREATE TEMP VIEW` inside a
 * batch is unspecified behaviour, so instead this module exports fixed SQL
 * *text* that each statement prefixes. Values are **never** interpolated, 
 * only literal fragments, and every statement binds exactly ?1/?2/?3, so a
 * fragment referenced twice still binds once. (?3 is data, bound as a JSON
 * string, never interpolated.)
 *
 * ── Things SQLite does not have, and what replaces them ────────────────────
 * percentile_cont/disc -> a ROW_NUMBER window, see medianOf()
 * generate_series      -> a recursive CTE, see DAY_GRID
 * FULL OUTER JOIN      -> a key set + two LEFT JOINs (designed out on purpose;
 *                         it exists from 3.39 but there is no reason to bet)
 * REGEXP               -> nothing. All bucketing moved to sources.ts.
 * array_agg(ORDER BY)  -> lastNonNull(), a lexical-prefix trick
 */

import { CONVERSION_TAGS } from './events';

/** `'a','b','c'` from a literal tag list. Safe: these are hand-written consts. */
function quoteList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(', ');
}

/**
 * ?1 = since ms, ?2 = until ms, ?3 = JSON array of session ids to leave out.
 *
 * The internal filter is a **whole-session** verdict, not per-event. Lumen
 * measured its own office leaving by three different ISPs across three
 * consecutive requests; an event-level filter leaves every internal session
 * partly counted, which produces a plausible number that is wrong.
 *
 * ?3 is `'[]'` when internal traffic is included, and otherwise the set
 * `internalSessionIds()` in queries.ts computed ONCE per window and cached
 * for a minute, so one dashboard load's six actions share it. It used
 * to be `?3 = 1` and a CTE that re-ran the `GROUP BY session_id HAVING
 * MAX(is_internal) = 1` scan over the whole window inside every statement,
 * thirteen times for one overview. Bound as one parameter, so the 100-parameter
 * cap is not in play; the ceiling is D1's 2 MB value size, roughly fifty
 * thousand internal sessions in one window.
 */
export const EV_CTE = `
  internal_sessions AS (
    SELECT value AS session_id FROM json_each(?3)
  ),
  ev AS (
    SELECT * FROM events
     WHERE created_at >= ?1 AND created_at <= ?2
       AND session_id NOT IN (SELECT session_id FROM internal_sessions)
  )`;

/**
 * The value of `col` on the newest row of the group that has one.
 *
 * SQLite has no ordered-set aggregate, so the sort key is packed into a
 * lexically sortable prefix and stripped back off. `||` with NULL yields NULL
 * and MAX ignores NULLs, so "last NON-NULL" is free. 13 digits covers epoch
 * millis until the year 2286.
 *
 * Postgres equivalent:
 *   (array_agg(col ORDER BY created_at DESC) FILTER (WHERE col IS NOT NULL))[1]
 */
export const lastNonNull = (col: string) =>
  `substr(MAX(printf('%013d', created_at) || ${col}), 14)`;

export const firstNonNull = (col: string) =>
  `substr(MIN(printf('%013d', created_at) || ${col}), 14)`;

/**
 * The IST calendar date of an epoch-ms column, as 'YYYY-MM-DD'.
 *
 * `date(x,'unixepoch')` takes **seconds**, hence the /1000. India has no DST,
 * so +19800 is exact and needs no timezone database.
 *
 * Never use the `'localtime'` modifier: it resolves against the server's zone,
 * which is UTC on a Worker, and reproduces the source system's bug where
 * everything between 00:00 and 05:30 IST counted against the previous day.
 *
 * This must only ever appear in SELECT/GROUP BY. In a WHERE clause it defeats
 * every index and re-opens the boundary problem from the other side.
 */
export const IST_DAY = (col: string) =>
  `date(${col} / 1000 + 19800, 'unixepoch')`;

/** Guarded JSON read. One malformed row would otherwise kill the statement. */
export const prop = (key: string) =>
  `CASE WHEN json_valid(props) THEN json_extract(props, '$.${key}') END`;

/**
 * 1 when a page_view row continues the view before it rather than starting a
 * new one, else 0.
 *
 * The browser treats `visibilitychange -> hidden` as an exit, so every tab
 * switch flushes a terminal row for the section on screen, and on return the
 * same section is picked up again with `previous` still naming it. The row
 * that closes the resumed stretch therefore carries `from` equal to its own
 * section, which no real transition can produce (commit() only moves between
 * two different sections). Counting it as a view made one read of `#work`
 * with two tab switches three views, and a one-section visit "engaged".
 */
export const RESUMED_VIEW = `(CASE WHEN event = 'page_view' AND path LIKE '/#%'
       AND ${prop('from')} = substr(path, 3) THEN 1 ELSE 0 END)`;

/**
 * The row was recorded on the homepage: `/`, or one of its `/#section` paths.
 *
 * Scroll milestones and `max_scroll_px` are per page since the recorders
 * learned about client-side navigation, so a 100% on /privacy (one screen
 * tall) is a real milestone of a different page. Mixed in, it read as the
 * visitor having reached the foot of the portfolio.
 */
export const ON_HOME = `(path = '/' OR path LIKE '/#%')`;

/**
 * Per-session rollup.
 *
 * `MIN(CASE WHEN event='visit' …)` for the campaign columns is exact here in a
 * way it would not be on a multi-route app: this site has one route, so a
 * session has exactly one `visit` row. If that ever stops being true, switch
 * these to firstNonNull().
 *
 * The conversion flags key off click *tags* rather than dedicated verbs. A
 * portfolio's conversion is "did they try to reach me", and that is expressed
 * by which tag was clicked. The lists come from events.ts so a renamed tag
 * cannot silently empty a funnel step.
 */
export const SESS_CTE = `
  sess AS (
    SELECT
      session_id,
      MIN(created_at) AS first_seen,
      MAX(created_at) AS last_seen,
      SUM(CASE WHEN event = 'page_view' AND ${RESUMED_VIEW} = 0
               THEN 1 ELSE 0 END) AS section_views,
      COALESCE(
        MAX(CASE WHEN event = 'session_end' THEN duration_ms END),
        MAX(created_at) - MIN(created_at)
      ) AS duration_ms,
      MAX(CASE WHEN event = 'chat_open' THEN 1 ELSE 0 END) AS did_chat,
      MAX(CASE WHEN event = 'chat_ask'  THEN 1 ELSE 0 END) AS did_ask,
      MAX(CASE WHEN event = 'click'
                AND ${prop('tag')} IN (${quoteList(CONVERSION_TAGS.contact)})
               THEN 1 ELSE 0 END) AS did_contact,
      MAX(CASE WHEN event = 'click'
                AND ${prop('tag')} IN (${quoteList(CONVERSION_TAGS.resume)})
               THEN 1 ELSE 0 END) AS did_resume,
      MAX(CASE WHEN event = 'click'
                AND ${prop('tag')} IN (${quoteList(CONVERSION_TAGS.outbound)})
               THEN 1 ELSE 0 END) AS did_outbound,
      MAX(CASE WHEN event = 'mode_change' AND ${prop('to')} = 'immersive'
               THEN 1 ELSE 0 END) AS saw_immersive,
      MAX(CASE WHEN event = 'session_end' AND ${ON_HOME}
               THEN CAST(${prop('max_scroll_px')} AS INTEGER) END)
        AS max_scroll_px,
      MAX(CASE WHEN event = 'session_end'
               THEN CAST(${prop('immersive_ms')} AS INTEGER) END)
        AS immersive_ms,
      MAX(CASE WHEN event = 'session_end'
               THEN CAST(${prop('resume_ms')} AS INTEGER) END) AS resume_ms,
      ${lastNonNull('device')}     AS device,
      ${lastNonNull('browser')}    AS browser,
      ${lastNonNull('os')}         AS os,
      ${lastNonNull('city')}       AS city,
      ${lastNonNull('region')}     AS region,
      ${lastNonNull('country')}    AS country,
      ${lastNonNull('asn_org')}    AS asn_org,
      ${lastNonNull('ip_prefix')}  AS ip_prefix,
      ${lastNonNull('visitor_id')} AS visitor_id,
      ${firstNonNull('referrer_host')} AS referrer_host,
      MIN(CASE WHEN event = 'visit' THEN utm_source END)      AS utm_source,
      MIN(CASE WHEN event = 'visit' THEN utm_medium END)      AS utm_medium,
      MIN(CASE WHEN event = 'visit' THEN utm_campaign END)    AS utm_campaign,
      MIN(CASE WHEN event = 'visit' THEN utm_content END)     AS utm_content,
      MIN(CASE WHEN event = 'visit' THEN click_id_source END) AS click_id_source
    FROM ev
    GROUP BY session_id
  )`;

/** Both fragments, in the order every statement needs them. */
export const WITH_SESS = `WITH ${EV_CTE}, ${SESS_CTE}`;
export const WITH_EV = `WITH ${EV_CTE}`;

/**
 * Median of `col` over `src`, correct for odd and even n.
 *
 * `(n+1)/2, (n+2)/2` is integer division: n=5 gives 3 and 3; n=4 gives 2 and
 * 3, averaged. One pass, no LIMIT/OFFSET subquery trickery.
 */
export const medianOf = (src: string, col: string) => `
  (SELECT AVG(${col}) FROM (
     SELECT ${col},
            ROW_NUMBER() OVER (ORDER BY ${col}) AS rn,
            COUNT(*)     OVER ()                AS n
       FROM ${src} WHERE ${col} IS NOT NULL
   ) WHERE rn IN ((n + 1) / 2, (n + 2) / 2))`;

/**
 * A day grid over the window, so a quiet day comes back as an explicit 0.
 *
 * Without the grid a gap renders as "no data", which reads as a missing
 * measurement rather than as zero traffic. Bounded by the 366-day range cap.
 */
export const DAY_GRID = `
  days(day) AS (
    SELECT ${IST_DAY('?1')}
    UNION ALL
    SELECT date(day, '+1 day') FROM days WHERE day < ${IST_DAY('?2')}
  )`;
