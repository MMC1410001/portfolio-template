/**
 * The bug this file exists to catch, which has now shipped twice.
 *
 * On a Cloudflare Worker the clock is pinned to the epoch for the whole of
 * top-level module evaluation: `new Date()` is 1 January 1970 until a request
 * is being handled. So an answer that interpolates `tenure(...)` with a plain
 * `answer:` template literal computes its duration once, at import, and bakes
 * "under a month" into itself. It then ships, and tells a recruiter that
 * someone with four years of experience has under a month of it.
 *
 * Every local test passes, because Node's clock works at import. It reached
 * production once (see the note at the top of tests/faq.test.ts), was fixed by
 * moving those entries to `get answer()` so the string is built per request,
 * and reached production again the moment a new entry was written with
 * `answer:` instead.
 *
 * ── Why this is a source check and not a runtime one ──────────────────────
 * The obvious test stubs the clock, imports content/faq and looks for "under
 * a month" in the output. That test was written first and passed with the bug
 * present: it stubbed `Date.now`, and tenure() reads `new Date()`. Replacing
 * the Date constructor instead works, but it makes the test's correctness
 * depend on a detail of tenure() that the test cannot see.
 *
 * Reading the source is blunter and cannot be fooled by either. The rule is
 * mechanical: an answer that calls tenure() must be a getter. One entry per
 * line is the established style in content/faq.ts, so a line is an entry.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { answers } from '@/content/faq';

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '../content/faq.ts');

test('every answer that computes a duration is a getter', () => {
  const offenders = readFileSync(SOURCE, 'utf8')
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.includes('tenure(') && line.includes("{id:'"))
    .filter(({ line }) => !line.includes('get answer()'));

  assert.deepEqual(
    offenders.map((o) => o.number),
    [],
    `content/faq.ts line(s) ${offenders.map((o) => o.number).join(', ')} interpolate tenure() into a plain ` +
      '`answer:` literal. On a Worker that is evaluated while the clock reads the epoch, so the duration ' +
      'ships as "under a month". Use `get answer(){return ...}`.',
  );
});

test('the rule has something to check', () => {
  const lines = readFileSync(SOURCE, 'utf8')
    .split('\n')
    .filter((line) => line.includes('tenure(') && line.includes("{id:'"));
  // One is enough for the rule above to be meaningful. It was three, which
  // quietly asserted how much content exists rather than that the guard has
  // something to guard — and failed when content was removed for the public
  // template, where those particular answers do not belong.
  assert.ok(lines.length >= 1, `expected at least one duration answer, found ${lines.length}`);
});

test('no answer is currently serving a frozen duration', () => {
  for (const entry of answers) {
    assert.doesNotMatch(entry.answer, /\bunder a month\b/i, `answer "${entry.id}" is serving a frozen duration`);
  }
});
