/**
 * A D1-shaped facade over `node:sqlite`, for build-time scripts only.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * `scripts/seed-analytics-demo.ts` needs to run the *real* schema, the *real*
 * insert path and the *real* queries against a throwaway database, so the
 * public showcase at `/analytics` shows output the production code actually
 * produced rather than numbers someone typed into a fixture. Hand-written
 * fixtures are the failure mode worth avoiding here: they drift the moment a
 * query changes, and they drift silently, because a plausible-looking number
 * is indistinguishable from a correct one.
 *
 * D1 and SQLite speak the same SQL. The only gap is the client surface, and
 * the analytics layer uses very little of it: `prepare`, `bind`, `all`,
 * `first`, `run`, `batch`. That is what this implements, and nothing more.
 *
 * ── Not for application code ───────────────────────────────────────────────
 * This is a Node module: it imports `node:sqlite`, which does not exist on a
 * Worker. Nothing under `app/`, `lib/` or `components/` may import it. It is
 * `scripts/`-only by design, which is also why it is not in `lib/analytics/`
 * where an accidental import would look reasonable.
 */

import { DatabaseSync } from 'node:sqlite';

/** What node:sqlite will accept as a bound value. */
type SqliteValue = null | number | bigint | string | Uint8Array;

/**
 * Coerce a D1-legal value into a node:sqlite-legal one.
 *
 * Booleans are the real reason this function exists. D1 accepts them and
 * stores 0/1; node:sqlite throws `TypeError`. `undefined` is folded to null
 * for the same reason, an optional field that happens to be absent should
 * write a NULL, not abort the insert.
 */
function coerce(value: unknown): SqliteValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'string' ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  // An object here is a bug in the caller, not something to silently JSON
  // encode: the analytics layer stringifies `props` itself, so a stray object
  // means a column is being written with the wrong shape.
  throw new TypeError(
    `d1-sqlite: cannot bind ${typeof value}, expected a primitive`,
  );
}

interface Result<T> {
  results: T[];
  success: true;
  meta: { changes: number; last_row_id: number; rows_read: number };
}

function meta(changes: number, lastRowId: number, rowsRead: number) {
  return { changes, last_row_id: lastRowId, rows_read: rowsRead };
}

/**
 * One prepared statement, optionally bound.
 *
 * `bind()` returns a new instance rather than mutating, matching D1, where
 * `stmt.bind(a)` and `stmt.bind(b)` are independent. Mutating would make a
 * reused prepared statement in a batch carry the previous call's values, which
 * is the kind of bug that produces plausible wrong numbers.
 */
class Statement {
  // Written as plain fields rather than constructor parameter properties:
  // `node --experimental-strip-types` runs in strip-only mode and rejects
  // parameter properties outright, and this file has to be runnable by it.
  readonly db: DatabaseSync;
  readonly sql: string;
  readonly values: SqliteValue[];

  constructor(db: DatabaseSync, sql: string, values: SqliteValue[] = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }

  bind(...values: unknown[]): Statement {
    return new Statement(this.db, this.sql, values.map(coerce));
  }

  all<T>(): Result<T> {
    const rows = this.db.prepare(this.sql).all(...this.values) as T[];
    return { results: rows, success: true, meta: meta(0, 0, rows.length) };
  }

  first<T>(): T | null {
    const row = this.db.prepare(this.sql).get(...this.values);
    return (row as T | undefined) ?? null;
  }

  run<T>(): Result<T> {
    const out = this.db.prepare(this.sql).run(...this.values);
    return {
      results: [],
      success: true,
      meta: meta(Number(out.changes), Number(out.lastInsertRowid), 0),
    };
  }
}

/**
 * `batch` is one transaction, as it is on D1.
 *
 * Faithful because the retention sweep depends on it: five statements that
 * must not half-apply. A `SELECT` inside a batch returns rows, an `INSERT`
 * returns `meta.changes`, and the caller distinguishes them by position, so
 * both paths are populated rather than guessing which one this statement is.
 */
class Database {
  readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  prepare(sql: string): Statement {
    return new Statement(this.db, sql);
  }

  batch<T>(statements: Statement[]): Result<T>[] {
    this.db.exec('BEGIN');
    try {
      // Every statement goes through `all()`: node:sqlite's `all()` works for
      // writes too (returning no rows), but `changes` is only reported by
      // `run()`. So write statements are detected and routed, rather than
      // asking the caller to declare which kind each one is.
      const out = statements.map((s) => {
        const isWrite = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(s.sql);
        return isWrite ? s.run<T>() : s.all<T>();
      });
      this.db.exec('COMMIT');
      return out;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }
}

/**
 * An in-memory database that satisfies the slice of `D1Database` this repo
 * uses.
 *
 * The cast is deliberate and load-bearing: `D1Database` has a dozen members
 * (`dump`, `withSession`, `exec` with different semantics) that a build script
 * has no business implementing. Asserting the narrow shape here means the
 * query layer stays typed against the real interface everywhere else, with
 * exactly one place where the substitution is admitted.
 */
export function openDemoDatabase(): {
  db: D1Database;
  close: () => void;
  raw: DatabaseSync;
} {
  const raw = new DatabaseSync(':memory:');
  // Foreign keys are off by default in SQLite and on in D1. The schema has no
  // foreign keys today, so this is insurance against a future one behaving
  // differently here than in production.
  raw.exec('PRAGMA foreign_keys = ON');
  const facade = new Database(raw);
  return {
    db: facade as unknown as D1Database,
    close: () => raw.close(),
    raw,
  };
}
