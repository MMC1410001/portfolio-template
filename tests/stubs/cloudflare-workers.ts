/**
 * `cloudflare:workers` for `npm run test:units`, mapped in by tests/ts-hooks.mjs.
 *
 * lib/analytics/db.ts reads its D1 binding from `env` here, and it is the one
 * import that kept every route handler out of the unit tests: a bare Node
 * process has no `cloudflare:` scheme. The binding is an in-memory SQLite
 * database behind the same D1 facade the demo seeder uses
 * (scripts/d1-sqlite.ts), so a route test runs the real schema, the real
 * statements and the real counters rather than a mock of them.
 *
 * `env` starts empty, which is the "no database" state db.ts treats as valid.
 * A test that wants storage calls bindDatabase() and closes what it returns.
 */
import { openDemoDatabase } from '../../scripts/d1-sqlite';

export const env: Record<string, unknown> = {};

/** A fresh, empty database bound as ANALYTICS_DB. The caller closes it. */
export function bindDatabase(): ReturnType<typeof openDemoDatabase> {
  const handle = openDemoDatabase();
  env.ANALYTICS_DB = handle.db;
  return handle;
}

/** Back to no database at all. */
export function clearDatabase(): void {
  delete env.ANALYTICS_DB;
}
