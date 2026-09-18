/**
 * Getting hold of the D1 binding, and making sure the schema exists.
 *
 * ── Why the binding is looked up defensively ───────────────────────────────
 * `.openai/hosting.json` names the binding and `vite.config.ts` hands it to
 * Miniflare, so locally it is whatever we wrote. Whether the OpenAI Sites
 * control plane provisions the production binding under exactly that string is
 * not discoverable from this repo. So: look it up by name, and fall back to
 * scanning `env` for the first value that quacks like a D1Database. The
 * `whoami` admin action reports which path was taken, which answers the
 * question in one request after a deploy instead of guessing.
 *
 * ── getDb() returning null is a first-class state ──────────────────────────
 * Not an error. The site must build and serve with no database at all, that
 * was the committed state until this feature landed. Every ingest write
 * becomes a no-op and the dashboard says "storage not configured" rather than
 * rendering zeros, because an empty panel and a missing database look
 * identical and only one of them means nobody visited.
 */

import { env } from 'cloudflare:workers';
import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from './schema';

const BINDING = 'ANALYTICS_DB';

function isD1(value: unknown): value is D1Database {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as D1Database).prepare === 'function' &&
    typeof (value as D1Database).batch === 'function'
  );
}

export interface DbHandle {
  db: D1Database;
  /** How it was found, reported by the whoami action. */
  via: 'name' | 'scan';
  binding: string;
}

export function getDbHandle(): DbHandle | null {
  const bag = env as unknown as Record<string, unknown>;

  const named = bag[BINDING];
  if (isD1(named)) return { db: named, via: 'name', binding: BINDING };

  for (const [key, value] of Object.entries(bag)) {
    if (isD1(value)) return { db: value, via: 'scan', binding: key };
  }
  return null;
}

export function getDb(): D1Database | null {
  return getDbHandle()?.db ?? null;
}

/**
 * Create the schema if it is missing. Memoised per isolate.
 *
 * ── Why this is authoritative and the migration files are the belt ─────────
 * The Sites plugin copies `drizzle/**` into the build output and the
 * Cloudflare plugin points `dist/server/wrangler.json` at a repo-root
 * `migrations/` directory, but nothing in this repo or in node_modules
 * reveals whether the control plane *applies* either one, in what order, or
 * with what bookkeeping. Anyone who says otherwise is guessing.
 *
 * So the authority is this function: verifiable today with `npm run dev`,
 * identical local and remote, no CLI, and nothing a platform migration story
 * we cannot read can break. Because every statement is IF NOT EXISTS,
 * "applied twice" and "never applied" are both harmless.
 *
 * Steady-state cost is zero; a cold isolate pays one SELECT.
 */
let ready: Promise<boolean> | null = null;

export function ensureSchema(db: D1Database): Promise<boolean> {
  ready ??= bootstrap(db).catch((error: unknown) => {
    console.error('[analytics] schema bootstrap failed', error);
    // Cleared so the next isolate (or the next request in this one) retries
    // rather than caching a transient failure for the isolate's lifetime.
    ready = null;
    return false;
  });
  return ready;
}

async function bootstrap(db: D1Database): Promise<boolean> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS analytics_meta (
         key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    )
    .run();

  const row = await db
    .prepare(`SELECT value FROM analytics_meta WHERE key = 'schema_version'`)
    .first<{ value: string }>();

  const current = row ? Number(row.value) : 0;
  if (Number.isFinite(current) && current >= SCHEMA_VERSION) return true;

  await db.batch(SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)));
  await db
    .prepare(
      `INSERT INTO analytics_meta (key, value) VALUES ('schema_version', ?1)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(String(SCHEMA_VERSION))
    .run();

  return true;
}

/** Test seam, and the escape hatch if a deploy needs the check re-run. */
export function __resetSchemaLatch(): void {
  ready = null;
}

export async function readMeta(
  db: D1Database,
  key: string,
): Promise<string | null> {
  const row = await db
    .prepare(`SELECT value FROM analytics_meta WHERE key = ?1`)
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function writeMeta(
  db: D1Database,
  key: string,
  value: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO analytics_meta (key, value) VALUES (?1, ?2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(key, value)
    .run();
}
