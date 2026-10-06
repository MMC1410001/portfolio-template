/**
 * scripts/preflight-deploy.mjs, run for real against a throwaway repo root.
 *
 * The script finds the repo from its own location, so a copy of it in a temp
 * directory reads that directory's wrangler.jsonc and résumé instead of this
 * repo's. PATH is emptied so `npx wrangler secret list` cannot run, which is
 * exactly the "could not read the secret list" case, deterministically and
 * without touching the network.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const BINDING = '"d1_databases": [{ "binding": "ANALYTICS_DB", "database_id": "11111111-2222-4333-8444-555555555555" }]';

function preflight(wrangler: string, env: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'preflight-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'public'));
    copyFileSync(new URL('../scripts/preflight-deploy.mjs', import.meta.url), join(root, 'scripts/preflight-deploy.mjs'));
    writeFileSync(join(root, 'wrangler.jsonc'), wrangler);
    writeFileSync(join(root, 'public/resume-sample.pdf'), '%PDF-1.7\n/Creator (Alex Rivera)\n');
    const run = spawnSync(process.execPath, [join(root, 'scripts/preflight-deploy.mjs')], { encoding: 'utf8', env: { PATH: '/nonexistent', ...env } as unknown as NodeJS.ProcessEnv });
    return { status: run.status, stdout: run.stdout, stderr: run.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('an unreadable secret list warns at a desk and blocks in CI', () => {
  const desk = preflight(`{ ${BINDING} }`);
  assert.equal(desk.status, 0, desk.stderr);
  assert.match(desk.stdout, /warn {2}Could not read the Worker's secret list/);
  const ci = preflight(`{ ${BINDING} }`, { CI: 'true' });
  assert.equal(ci.status, 1);
  assert.match(ci.stderr, /Deploy blocked by 1 problem/);
  assert.match(ci.stderr, /Could not read the Worker's secret list.*In CI this blocks/);
});

test('NIM_API_KEY with no D1 binding is blocked: the model cap fails closed without one', () => {
  const nimOnly = preflight('{ "vars": { "NIM_API_KEY": "nvapi-x" } }');
  assert.equal(nimOnly.status, 1);
  assert.match(nimOnly.stderr, /NIM_API_KEY is set but wrangler\.jsonc has no ANALYTICS_DB binding/);
  const withDb = preflight(`{ ${BINDING}, "vars": { "NIM_API_KEY": "nvapi-x" } }`);
  assert.equal(withDb.status, 0, withDb.stderr);
  assert.doesNotMatch(withDb.stderr, /NIM_API_KEY/);
});
