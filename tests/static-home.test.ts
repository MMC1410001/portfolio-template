/**
 * `/` must stay statically rendered (CLAUDE.md, Routes). Several choices in
 * the analytics code exist only to protect that, the heatmap preview flag is
 * read from window.location rather than useSearchParams(), and nothing fails
 * when one of them is undone: the build succeeds and the homepage is simply
 * rendered per request from then on.
 *
 * So this walks everything app/page.tsx and app/layout.tsx import, static and
 * lazy, through relative and `@/` specifiers (node_modules is not ours to
 * police), and fails on any file using an API that opts a route into dynamic
 * rendering. Comments are stripped first, since several explain exactly why
 * they do not use these APIs.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRIES = ['app/page.tsx', 'app/layout.tsx'];

function resolveSpecifier(from: string, spec: string): string | null {
  let base: string;
  if(spec.startsWith('@/')) base = join(ROOT, spec.slice(2));
  else if(spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  for(const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]){
    if(existsSync(c) && statSync(c).isFile() && /\.(tsx?|mjs|js)$/.test(c)) return c;
  }
  return null;
}

// Block comments, then line comments not preceded by ':' (keeps https:// in strings).
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function graph(): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = ENTRIES.map((e) => join(ROOT, e));
  while(queue.length){
    const file = queue.pop()!;
    if(seen.has(file)) continue;
    const src = stripComments(readFileSync(file, 'utf8'));
    seen.set(file, src);
    for(const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g)){
      const next = resolveSpecifier(file, m[1]);
      if(next) queue.push(next);
    }
  }
  return seen;
}

const DYNAMIC: [RegExp, string][] = [
  [/['"]next\/headers['"]/, "imports 'next/headers'"],
  [/\buseSearchParams\b/, 'uses useSearchParams()'],
  [/export\s+const\s+dynamic\b/, 'sets `export const dynamic`'],
];

test('the module graph behind / reaches the components it should', () => {
  const files = [...graph().keys()].map((f) => relative(ROOT, f));
  // If the walk breaks, every other assertion here passes vacuously.
  assert.ok(files.includes('components/portfolio/Portfolio.tsx'), 'the import walk did not reach Portfolio.tsx; the regex has drifted from the code');
  assert.ok(files.some((f) => f.startsWith('lib/analytics/')), 'the import walk did not reach lib/analytics');
  assert.ok(!files.includes('app/admin/page.tsx'), 'app/admin/page.tsx (which uses next/headers) is reachable from /');
});

test('nothing reachable from / opts it into dynamic rendering', () => {
  const offences: string[] = [];
  for(const [file, src] of graph()){
    const rel = relative(ROOT, file);
    for(const [re, what] of DYNAMIC) if(re.test(src)) offences.push(`${rel} ${what}`);
    // cookies()/headers() matter only as the next/headers request APIs.
    if(/['"]next\/headers['"]/.test(src) && /\b(?:cookies|headers)\s*\(/.test(src)) offences.push(`${rel} calls cookies()/headers() from next/headers`);
  }
  assert.deepEqual(offences, [], `/ must stay statically rendered (CLAUDE.md, Routes):\n  ${offences.join('\n  ')}`);
});
