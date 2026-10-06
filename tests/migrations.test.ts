/**
 * Applied migrations are immutable, and nothing else enforces it.
 *
 * `wrangler d1 migrations apply` records a migration by FILE NAME and never
 * re-reads one it has recorded. scripts/emit-migration.mjs files statements
 * under a version by the name of the object they create, so editing a CREATE
 * TABLE that 0001 already carries rewrites 0001, CI's "committed in sync"
 * diff passes (the output matches the schema), and the remote database never
 * sees the change. Pinning the bytes turns that into a failure here.
 *
 * Adding a schema version adds a file and needs no change to this list; pin
 * it below once the remote database has applied it.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);

const APPLIED: Record<string, string> = {
  '0001_init_analytics.sql': 'bf115e06d017711bbda19a9888989719b622609e8dad8f14f421d0bee1ac613d',
  '0002_chat_quota.sql': '483f53d4bd5adf2a9b1c8404caed3b0c01a3a9b3c287b1c7737b0b48a4a6b541',
  '0003_trusted_networks.sql': '3fe7d316d2b38b04b931a0d065b7806c1508702089f6e826359d3b915e455fcd',
};

// migrations/ is what wrangler applies; drizzle/ is the Sites copy of the same bytes.
for(const dir of ['migrations', 'drizzle']){
  test(`${dir}/: applied migration files are byte-for-byte unchanged`, () => {
    for(const [name, sha] of Object.entries(APPLIED)){
      const url = new URL(`${dir}/${name}`, ROOT);
      assert.ok(existsSync(url), `${dir}/${name} is gone. Applied migrations are immutable: wrangler tracks them by file name, so renaming or deleting one does not undo it on the remote database.`);
      const actual = createHash('sha256').update(readFileSync(url)).digest('hex');
      assert.equal(actual, sha,
        `${dir}/${name} changed. Applied migrations are immutable: wrangler never re-runs a file it has recorded, so this edit would never reach the remote D1. ` +
        'Revert the change to lib/analytics/schema.ts that caused it and add a new schema version instead (bump SCHEMA_VERSION, append the statements, add an INTRODUCED_IN entry in scripts/emit-migration.mjs).');
    }
  });
}
