/**
 * A resolver hook so `node --test` can import this project's TypeScript.
 *
 * The source uses extensionless relative imports (`./events`), which is what
 * `moduleResolution: "bundler"` expects and what Vite resolves. Node's ESM
 * resolver requires a real filename, and the alternative, adding `.ts` to
 * every import across the lib, would need `allowImportingTsExtensions` and
 * would make the source look unlike the rest of the repo purely to suit a
 * test runner.
 *
 * Twenty lines here, no new dependency, and the source stays untouched.
 * The same holds for the two runtime-only imports mapped to stubs below.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

// Runtime modules a bare Node process does not have. `cloudflare:workers` is
// the Worker runtime (lib/analytics/db.ts reads its binding from it) and
// `next/server` is a vinext shim; both are why the route handlers under
// app/api/ could not be imported by a test. Each maps to a small stub in
// tests/stubs/, which says what it stands in for.
const STUBS = {
  'cloudflare:workers': 'tests/stubs/cloudflare-workers.ts',
  'next/server': 'tests/stubs/next-server.ts',
};

export async function resolve(specifier, context, next) {
  if (Object.hasOwn(STUBS, specifier)) {
    return next(pathToFileURL(resolvePath(ROOT, STUBS[specifier])).href, context);
  }

  // `@/x` is the repo-root alias from tsconfig paths.
  if (specifier.startsWith('@/')) {
    const base = resolvePath(ROOT, specifier.slice(2));
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
      if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }

  // Extensionless relative import -> try the TypeScript file.
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const parent = context.parentURL ? dirname(fileURLToPath(context.parentURL)) : ROOT;
    const base = resolvePath(parent, specifier);
    for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
      if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }

  return next(specifier, context);
}
