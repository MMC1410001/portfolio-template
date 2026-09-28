/**
 * The browser half of analytics: queue.ts, tag.ts and clicks.ts, run against
 * the hand-rolled DOM in tests/dom-stub.ts.
 *
 *   npm run test:units
 *
 * The rules covered here are the ones whose failure looks like data rather
 * than like a bug: a click relabelled by an unrelated scroll, a chat question
 * sitting in `props.selector` for 180 days, an opted-out visitor's queue sent
 * anyway, a rage_click that swallows the name meant for its click.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting;
// the runner collects and awaits them itself.
import { click, h, local, resetBrowser } from './dom-stub';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  __peekQueue,
  __resetQueue,
  enrichLastEvent,
  flushEvents,
  queueEvent,
} from '../lib/analytics/queue';
import { trackSyntheticTag, trackTag } from '../lib/analytics/tag';
import {
  __resetClickTracking,
  describeElement,
  describeStructure,
  installClickTracking,
} from '../lib/analytics/clicks';
import { istDateTime, sliceColours } from '../components/admin/analytics-format';

function fresh(): void {
  resetBrowser();
  __resetQueue();
  __resetClickTracking();
}

// A queued event arms a 10s flush timer; leave none behind to hold the
// process open or fire a real fetch after the last test.
after(fresh);

const events = () => __peekQueue().map((e) => e.event);
const last = () => __peekQueue()[__peekQueue().length - 1];

// ── enrichLastEvent: a time window, not just a verb check ───────────────────

test('enrichLastEvent names a click queued in the same gesture', (t) => {
  fresh();
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  queueEvent('click', { props: { selector: 'button:Go' } });
  now += 10;
  assert.equal(enrichLastEvent('click', { value: 'x' }), true);
  assert.equal(last().props?.value, 'x');
});

test('enrichLastEvent refuses a click from an earlier gesture', (t) => {
  fresh();
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  queueEvent('click', { props: { selector: 'button:Go' } });
  now += 5_000;
  assert.equal(enrichLastEvent('click', { tag: 'scene-rotation' }), false);
  assert.equal(last().props?.tag, undefined);
});

test('trackTag outside the window writes its own synthetic row', (t) => {
  fresh();
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  queueEvent('click', { props: { selector: 'button:Go', tag: null } });
  now += 5_000;
  trackTag('scene-rotation');
  assert.deepEqual(events(), ['click', 'click']);
  assert.equal(__peekQueue()[0].props?.tag, null, 'the earlier click is untouched');
  assert.equal(last().props?.synthetic, true);
  assert.equal(last().props?.tag, 'scene-rotation');
});

test('trackSyntheticTag never enriches, even inside the window', (t) => {
  fresh();
  t.mock.method(Date, 'now', () => 1_000_000);
  queueEvent('click', { props: { selector: 'button:Go', tag: null } });
  trackSyntheticTag('scene-rotation', { frames: 30 });
  assert.equal(__peekQueue().length, 2);
  assert.equal(__peekQueue()[0].props?.tag, null);
  assert.equal(last().props?.synthetic, true);
  assert.equal(last().props?.frames, 30);
  // The same section/mode fields a real click row carries.
  assert.ok('section' in (last().props ?? {}));
  assert.equal(last().props?.mode, 'resume');
});

// ── The queue-order rule (ANALYTICS.md, "Tagging") ─────────────────────────

test('a rage burst queues rage_click BEFORE the click row, so trackTag names the click', (t) => {
  fresh();
  t.mock.method(Date, 'now', () => 1_000_000);
  installClickTracking();
  const button = h('button', {}, 'Download');
  click(button);
  click(button);
  click(button);
  assert.deepEqual(events(), ['click', 'click', 'rage_click', 'click']);
  trackTag('resume-pdf-hero', { value: 'pdf' });
  assert.equal(__peekQueue().length, 4, 'enriched, not a fifth synthetic row');
  assert.equal(last().event, 'click');
  assert.equal(last().props?.tag, 'resume-pdf-hero');
  assert.equal(__peekQueue()[2].props?.tag, undefined, 'rage_click is not renamed');
});

// ── No visitor text in a selector ─────────────────────────────────────────

const PII = 'mail me at someone@example.com or 9876543210';

test('a dead click is named by structure, never by textContent', (t) => {
  fresh();
  t.mock.method(Date, 'now', () => 1_000_000);
  installClickTracking();
  const span = h('span', {}, PII);
  h('div', { class: 'project-card grid gap-2' }, span);
  click(span);
  assert.deepEqual(events(), ['dead_click']);
  assert.equal(last().props?.selector, 'div.project-card');
});

test('a dead click inside the chat transcript carries none of the question', (t) => {
  fresh();
  t.mock.method(Date, 'now', () => 1_000_000);
  installClickTracking();
  const bubble = h('div', { class: 'chat-bubble' }, PII);
  h('div', { 'data-track-private': '', class: 'chat-messages' }, bubble);
  click(bubble);
  const selector = String(last().props?.selector);
  assert.equal(selector, 'div.chat-bubble');
  assert.ok(!selector.includes('@') && !/\d{7,}/.test(selector));
});

test('a rage burst on nothing interactive is named by structure too', (t) => {
  fresh();
  t.mock.method(Date, 'now', () => 1_000_000);
  installClickTracking();
  const bubble = h('div', { id: 'msg-3' }, PII);
  click(bubble);
  click(bubble);
  click(bubble);
  const rage = __peekQueue().find((e) => e.event === 'rage_click');
  assert.equal(rage?.props?.selector, 'div#msg-3');
  assert.equal(rage?.props?.dead, true);
  for (const e of __peekQueue()) {
    assert.ok(!String(e.props?.selector).includes('example.com'));
  }
});

test('a control inside [data-track-private] is named by attributes, never text', () => {
  const link = h('a', {}, PII);
  h('div', { 'data-track-private': '' }, h('p', {}, link));
  assert.deepEqual(describeElement(link), { selector: 'a', text: null, tag: null });

  const labelled = h('a', { 'aria-label': 'Open link' }, PII);
  h('div', { 'data-track-private': '' }, labelled);
  assert.equal(describeElement(labelled).selector, 'a:Open link');
  assert.equal(describeElement(labelled).text, null);

  const tagged = h('button', { 'data-track-tag': 'chat-email' }, PII);
  h('div', { 'data-track-private': '' }, tagged);
  assert.deepEqual(describeElement(tagged), { selector: 'chat-email', text: null, tag: 'chat-email' });
});

test('a control outside any private region is named exactly as before', () => {
  const button = h('button', {}, '  Explore   my\n work ');
  assert.deepEqual(describeElement(button), {
    selector: 'button:Explore my work',
    text: 'Explore my work',
    tag: null,
  });
});

test('describeStructure reads markup only', () => {
  assert.equal(describeStructure(h('section', {}, PII)), 'section');
  assert.equal(describeStructure(h('div', { id: 'work', class: 'a' })), 'div#work');
  assert.equal(describeStructure(h('div', { class: '  hero  big' })), 'div.hero');
});

// ── Suppression is checked at send time as well ──────────────────────────

test('flushEvents sends when tracking is allowed', async (t) => {
  fresh();
  const calls: unknown[] = [];
  t.mock.method(globalThis, 'fetch', async (...args: unknown[]) => {
    calls.push(args);
    return new Response(null, { status: 204 });
  });
  queueEvent('click', { props: { selector: 'button:Go' } });
  await flushEvents();
  assert.equal(calls.length, 1);
  assert.equal(__peekQueue().length, 0);
});

test('opting out after events were queued sends nothing and clears the queue', async (t) => {
  fresh();
  const calls: unknown[] = [];
  t.mock.method(globalThis, 'fetch', async (...args: unknown[]) => {
    calls.push(args);
    return new Response(null, { status: 204 });
  });
  queueEvent('click', { props: { selector: 'button:Go' } });
  queueEvent('scroll_depth', { props: { depth: 25 } });
  assert.equal(__peekQueue().length, 2);
  local.setItem('pfInternal', '1'); // what /privacy's opt-out writes
  await flushEvents();
  await flushEvents(true);
  assert.equal(calls.length, 0);
  assert.equal(__peekQueue().length, 0);
});

// ── Admin presentation helpers ───────────────────────────────────────────

test('istDateTime renders in IST whatever the runtime zone', () => {
  // 20:00 UTC on 27 Sep is 01:30 IST on 28 Sep.
  const out = istDateTime(Date.UTC(2026, 8, 27, 20, 0));
  assert.match(out, /^28\/09\/(20)?26, 1:30\s?(am|AM) IST$/);
});

test('sliceColours follows the entity, not its rank', () => {
  const palette = ['a', 'b', 'c'];
  const one = sliceColours(['desktop', 'mobile', 'tablet'], palette);
  const two = sliceColours(['mobile', 'tablet', 'desktop'], palette);
  assert.deepEqual(one, ['a', 'b', 'c']);
  assert.deepEqual(two, ['b', 'c', 'a']);
  // Colliding preferences stay distinct, and still independent of order.
  const x = sliceColours(['iOS', 'ChromeOS', 'Other'], palette);
  const y = sliceColours(['Other', 'iOS', 'ChromeOS'], palette);
  assert.equal(new Set(x).size, 3);
  assert.deepEqual([y[1], y[2], y[0]], x);
});
