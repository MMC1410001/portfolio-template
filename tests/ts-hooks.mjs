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
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

export async function resolve(specifier, context, next) {
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
