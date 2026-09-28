/**
 * Guards the `@source not` list at the end of app/globals.css.
 *
 * Tailwind is told not to scan the vendored shadcn files the app does not
 * use, which is most of the render-blocking stylesheet. The failure that list
 * invites is quiet: import a component that is still excluded and it renders
 * with none of its utilities, typechecks, builds, and looks merely broken.
 * So this walks the imports the way the bundler does, from every file outside
 * components/ui/ and then through ui files importing each other, and fails on
 * any reachable file that the stylesheet excludes.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, ROOT), 'utf8');

function walk(dir: string): string[] {
  return readdirSync(new URL(dir, ROOT), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(rel);
    return /\.(tsx?|mjs)$/.test(entry.name) ? [rel] : [];
  });
}

const excluded = () =>
  [...read('app/globals.css').matchAll(/@source not "\.\.\/components\/ui\/([^"]+)\.tsx";/g)].map((m) => m[1]);

function reachableUi(): Set<string> {
  const queue = ['app', 'components', 'hooks', 'lib', 'content']
    .flatMap(walk)
    .filter((f) => !f.startsWith('components/ui/'))
    .flatMap((f) => [...read(f).matchAll(/from ['"](?:@\/components\/ui\/|(?:\.\.?\/)+(?:components\/)?ui\/)([a-z0-9-]+)['"]/g)].map((m) => m[1]));
  const seen = new Set<string>();
  while (queue.length) {
    const name = queue.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const source = read(`components/ui/${name}.tsx`);
    for (const m of source.matchAll(/from ['"](?:@\/components\/ui\/|\.\/)([a-z0-9-]+)['"]/g)) queue.push(m[1]);
  }
  return seen;
}

test('no component the app imports is excluded from the Tailwind scan', () => {
  const used = reachableUi();
  assert.ok(used.has('button'), 'the import walk found nothing; the regex has drifted from the code');
  const wrong = excluded().filter((name) => used.has(name));
  assert.deepEqual(wrong, [], `imported, but app/globals.css has \`@source not\` for: ${wrong.join(', ')}`);
});

test('every excluded file exists, so the list cannot rot into a no-op', () => {
  const list = excluded();
  assert.ok(list.length > 0, 'the `@source not` list is gone or its format changed');
  const missing = list.filter((name) => !existsSync(new URL(`components/ui/${name}.tsx`, ROOT)));
  assert.deepEqual(missing, []);
});
