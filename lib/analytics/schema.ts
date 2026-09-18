/**
 * The D1 schema, the single source both the runtime bootstrap and the
 * committed migration files derive from.
 *
 * ── Storage format decisions, since they drive every query ─────────────────
 * timestamptz -> INTEGER epoch **milliseconds**. Matches Date.now() with no
 *   formatting step, range filters are integer compares an index serves, and
 *   IST bucketing is one addition. TEXT ISO-8601 also sorts correctly but
 *   costs ~24 bytes a row, forces strftime on every comparison, and invites
 *   mixed-format rows. `created_at` is assigned in TS, never by a SQL default,
 *   so a batch's ordering is explicit.
 * uuid PK -> INTEGER PRIMARY KEY (a rowid alias). Free, 8 bytes instead of 36,
 *   and monotonic in insert order, which is what lets `COALESCE(seq, id)`
 *   break ties inside a batch. `gen_random_uuid()` does not exist in SQLite.
 * inet/cidr -> no address column at all. See net.ts.
 * jsonb -> TEXT + json_extract. JSON1 is compiled into D1. **Every read is
 *   guarded with json_valid()**: json_extract on malformed text raises and
 *   kills the whole statement, so one bad legacy row would take down a panel.
 * numeric(6,5) -> REAL. clampPct already rounds to 5 dp.
 * boolean -> INTEGER 0/1.
 *
 * ── Migrating after v1 ─────────────────────────────────────────────────────
 * `ALTER TABLE … ADD COLUMN` has no IF NOT EXISTS in SQLite, so additive
 * changes are NOT blindly re-runnable. From v2 onward, bump SCHEMA_VERSION and
 * add the statements to a version-gated group rather than appending to the
 * flat v1 list. Getting this wrong is exactly the trap the source system
 * documents in its `008_fix_missing_columns.sql`.
 */

export const SCHEMA_VERSION = 1;

/** Ordered, re-runnable DDL. Every statement is IF NOT EXISTS. */
export const SCHEMA_STATEMENTS: readonly string[] = [
  // D1 restricts PRAGMAs, so `PRAGMA user_version` is not a usable version
  // store. A one-row table is portable and readable from a plain SELECT.
  `CREATE TABLE IF NOT EXISTS analytics_meta (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS events (
     id              INTEGER PRIMARY KEY,
     session_id      TEXT    NOT NULL,
     visitor_id      TEXT,
     event           TEXT    NOT NULL,
     path            TEXT,
     section         TEXT,
     mode            TEXT,
     referrer        TEXT,
     referrer_host   TEXT,
     props           TEXT,
     viewport_w      INTEGER,
     viewport_h      INTEGER,
     device          TEXT,
     browser         TEXT,
     os              TEXT,
     duration_ms     INTEGER,
     seq             INTEGER,
     ip_hash         TEXT,
     ip_prefix       TEXT,
     is_internal     INTEGER NOT NULL DEFAULT 0,
     country         TEXT,
     region          TEXT,
     city            TEXT,
     asn_org         TEXT,
     utm_source      TEXT,
     utm_medium      TEXT,
     utm_campaign    TEXT,
     utm_content     TEXT,
     utm_term        TEXT,
     click_id        TEXT,
     click_id_source TEXT,
     landing_path    TEXT,
     created_at      INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS events_created_idx ON events (created_at)`,
  `CREATE INDEX IF NOT EXISTS events_event_created_idx
     ON events (event, created_at)`,
  `CREATE INDEX IF NOT EXISTS events_session_order_idx
     ON events (session_id, created_at, seq)`,
  `CREATE INDEX IF NOT EXISTS events_visitor_created_idx
     ON events (visitor_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS events_section_created_idx
     ON events (section, created_at)`,

  // Separate table for the source system's reason: 10-100x the volume of
  // funnel events and a much shorter useful life (30d vs 180d). Mixing them
  // makes every funnel aggregate scan past heatmap rows it does not need.
  `CREATE TABLE IF NOT EXISTS click_points (
     id          INTEGER PRIMARY KEY,
     session_id  TEXT    NOT NULL,
     path        TEXT    NOT NULL,
     section     TEXT,
     mode        TEXT,
     device      TEXT,
     viewport_w  INTEGER,
     viewport_h  INTEGER,
     x_pct       REAL    NOT NULL,
     y_pct       REAL    NOT NULL,
     doc_h       INTEGER,
     selector    TEXT,
     kind        TEXT    NOT NULL DEFAULT 'click',
     is_internal INTEGER NOT NULL DEFAULT 0,
     created_at  INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS click_points_kind_idx
     ON click_points (kind, created_at)`,
  `CREATE INDEX IF NOT EXISTS click_points_created_idx
     ON click_points (created_at)`,

  // Backend health only, no question text ever reaches this table. Written by
  // /api/chat, which is the one thing that knows whether PYTHON_CHAT_URL
  // answered. Rendered in its own card so it cannot double-count the
  // client-side chat_* events.
  `CREATE TABLE IF NOT EXISTS chat_health (
     day                 TEXT PRIMARY KEY,
     requests            INTEGER NOT NULL DEFAULT 0,
     backend_configured  INTEGER NOT NULL DEFAULT 0,
     backend_ok          INTEGER NOT NULL DEFAULT 0,
     backend_fail        INTEGER NOT NULL DEFAULT 0,
     guard_short_circuit INTEGER NOT NULL DEFAULT 0
   )`,

  // The one thing an in-memory Map cannot do on Workers, where isolates are
  // created and destroyed per colo per burst. See ingest.ts.
  `CREATE TABLE IF NOT EXISTS ingest_budget (
     bucket       TEXT PRIMARY KEY,
     window_start INTEGER NOT NULL,
     events       INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS ingest_budget_window_idx
     ON ingest_budget (window_start)`,
];

/**
 * Retention horizons, in days.
 *
 * Question text lives 30 days against the event log's 180, the same asymmetry
 * the source system applied to click coordinates, and the answer given when
 * this was asked. The panel reports the horizon alongside every number, so a
 * 366-day request against a 180-day table does not read as a traffic collapse.
 */
export const RETENTION_DAYS = {
  events: 180,
  clickPoints: 30,
  questionText: 30,
  chatHealth: 365,
} as const;
