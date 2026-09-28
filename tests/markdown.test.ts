/**
 * The Markdown subset that publishes ANALYTICS.md at /analytics/design-notes.
 * The last test parses the real file, so a construct it starts using that the
 * parser mangles fails here rather than on the public page.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseInline, parseMarkdown, slugify } from '../lib/markdown';

test('headings get anchors, and repeated headings distinct ones', () => {
  const blocks = parseMarkdown('## The `ev` CTE\n\n## The `ev` CTE');
  assert.deepEqual(blocks.map((b) => b.kind === 'heading' && b.id), ['the-ev-cte', 'the-ev-cte-1']);
  assert.equal(slugify('Why `#northwind-erp` is different'), 'why-northwind-erp-is-different');
});

test('hard-wrapped lines join into one paragraph', () => {
  assert.deepEqual(parseMarkdown('one\ntwo\n\nthree'), [
    { kind: 'paragraph', text: 'one two' },
    { kind: 'paragraph', text: 'three' },
  ]);
});

test('fenced code keeps its lines and is not interpreted', () => {
  assert.deepEqual(parseMarkdown('```\na **b**\n  c\n```'), [{ kind: 'code', text: 'a **b**\n  c' }]);
});

test('a table needs its separator row, and keeps inline code with pipes out of scope', () => {
  const [table] = parseMarkdown('| A | B |\n| --- | :-: |\n| `x` | y |');
  assert.deepEqual(table, { kind: 'table', head: ['A', 'B'], rows: [['`x`', 'y']] });
});

test('list items absorb their indented continuation lines', () => {
  const [list] = parseMarkdown('- first\n  more\n- second\n\n1. one\n2. two');
  assert.deepEqual(list, { kind: 'list', ordered: false, items: ['first more', 'second'] });
  assert.equal(parseMarkdown('1. one\n   wrapped\n2. two')[0].kind, 'list');
});

test('inline marks: code first, so nothing inside a code span is a mark', () => {
  assert.deepEqual(parseInline('a `x*y*z` **b** and *c* d'), [
    { kind: 'text', text: 'a ' },
    { kind: 'code', text: 'x*y*z' },
    { kind: 'text', text: ' ' },
    { kind: 'strong', children: [{ kind: 'text', text: 'b' }] },
    { kind: 'text', text: ' and ' },
    { kind: 'em', children: [{ kind: 'text', text: 'c' }] },
    { kind: 'text', text: ' d' },
  ]);
  assert.deepEqual(parseInline('2 * 3 * 4'), [{ kind: 'text', text: '2 * 3 * 4' }]);
  assert.deepEqual(parseInline('[a](https://x.test)'), [{ kind: 'link', href: 'https://x.test', children: [{ kind: 'text', text: 'a' }] }]);
});

test('ANALYTICS.md parses with nothing lost', () => {
  const source = readFileSync(new URL('../ANALYTICS.md', import.meta.url), 'utf8');
  const blocks = parseMarkdown(source);
  const headings = source.split('\n').filter((l) => /^#{1,6} /.test(l)).length;
  assert.equal(blocks.filter((b) => b.kind === 'heading').length, headings);
  assert.equal(blocks.filter((b) => b.kind === 'code').length, (source.match(/^```/gm) ?? []).length / 2);
  assert.ok(blocks.filter((b) => b.kind === 'table').length >= 1);
  // Every table row has as many cells as its header.
  for (const b of blocks) if (b.kind === 'table') for (const row of b.rows) assert.equal(row.length, b.head.length, row.join('|'));
});
