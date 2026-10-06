/**
 * The recorders across navigations, tab switches and the opt-out: sections.ts,
 * scroll.ts, cta.ts and hooks/analytics-route.ts, on tests/dom-stub.ts.
 *
 *   npm run test:units
 *
 * Each of these failed as data, not as an error: a next/link round trip that
 * ended section tracking for the session, a tab switch filed as a second exit,
 * milestones that could never be reached twice, an opt-out that kept the id.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting;
// the runner collects and awaits them itself.
import {
  click,
  documentListeners,
  fakeDocument,
  fakeWindow,
  fireWindow,
  h,
  intersect,
  isObserved,
  liveObservers,
  local,
  mount,
  resetBrowser,
  resetDocument,
  session,
  setVisibility,
  unmount,
  windowListeners,
} from './dom-stub';
import { afterEach, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';

import { __peekQueue, __resetQueue, installFlushHooks } from '../lib/analytics/queue';
import {
  __resetSectionTracking,
  currentSection,
  installSectionTracking,
} from '../lib/analytics/sections';
import {
  __resetScrollTracking,
  installScrollTracking,
  maxScrollReached,
  resetScrollDepth,
} from '../lib/analytics/scroll';
import { __resetCtaVisibility, installCtaVisibility, resetCtaViews } from '../lib/analytics/cta';
import { __resetClickTracking, installClickTracking } from '../lib/analytics/clicks';
import { __resetAttribution, captureAttribution } from '../lib/analytics/utm';
import {
  __resetAnalyticsRoute,
  forgetAnalyticsIdentity,
  syncAnalyticsRoute,
} from '../hooks/analytics-route';

/** Mocked timers and clock, and a fetch that goes nowhere. */
function fresh(t: TestContext, pathname = '/'): void {
  resetBrowser();
  resetDocument(pathname);
  __resetQueue();
  __resetSectionTracking();
  __resetScrollTracking();
  __resetCtaVisibility();
  __resetClickTracking();
  __resetAttribution();
  __resetAnalyticsRoute();
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204 }));
}

afterEach(() => {
  __resetSectionTracking();
  __resetScrollTracking();
  __resetCtaVisibility();
  __resetClickTracking();
  __resetQueue();
});

const rows = (event: string) => __peekQueue().filter((e) => e.event === event);

function sections() {
  return { hero: h('section', { id: 'hero' }), work: h('section', { id: 'work' }) };
}

/** Enter `el`'s section and let the settle debounce commit it. */
function enter(t: TestContext, el: Element): void {
  intersect(el, true);
  t.mock.timers.tick(600);
}

// ── Sections across a client-side navigation ──────────────────────────────

test('a round trip through /dashboards keeps section tracking alive', (t) => {
  fresh(t);
  const first = sections();
  mount(first.hero, first.work);
  installSectionTracking();
  syncAnalyticsRoute('/');
  enter(t, first.hero);
  assert.equal(currentSection(), 'hero');
  t.mock.timers.tick(2_000);

  // Away: the page is replaced, and the provider tells the recorders.
  unmount(first.hero, first.work);
  (fakeWindow.location as { pathname: string }).pathname = '/dashboards';
  syncAnalyticsRoute('/dashboards');
  const left = rows('page_view');
  assert.equal(left.length, 1);
  assert.equal(left[0].path, '/#hero');
  assert.equal(left[0].props?.to, null);
  assert.equal(left[0].props?.terminal, undefined, 'the session is still going');
  assert.equal(currentSection(), null);

  // Back: same ids, new nodes. The old bug was that nothing watched these.
  const second = sections();
  mount(second.hero, second.work);
  (fakeWindow.location as { pathname: string }).pathname = '/';
  syncAnalyticsRoute('/');
  assert.ok(isObserved(second.hero) && isObserved(second.work));
  assert.ok(!isObserved(first.hero), 'the detached node is let go');
  enter(t, second.hero);
  assert.equal(currentSection(), 'hero');
  t.mock.timers.tick(1_500);
  intersect(second.hero, false);
  enter(t, second.work);
  const views = rows('page_view');
  assert.equal(views.length, 2);
  assert.equal(views[1].path, '/#hero');
  assert.equal(views[1].props?.to, 'work');
  assert.equal(views[1].props?.from, null, 'no transition claimed across routes');
});

test('the mutation scanner re-attaches a replaced section on its own', (t) => {
  fresh(t);
  const first = sections();
  mount(first.hero);
  installSectionTracking();
  // It used to disconnect once every section had been found.
  mount(first.work);
  t.mock.timers.tick(250);
  assert.equal(liveObservers().mutation, 1);

  unmount(first.hero);
  const hero = h('section', { id: 'hero' });
  mount(hero);
  t.mock.timers.tick(250);
  assert.ok(isObserved(hero));
  assert.ok(!isObserved(first.hero));
  enter(t, hero);
  assert.equal(currentSection(), 'hero');
});

// ── A tab switch is a provisional exit ──────────────────────────────────

test('a hide ends the view once, and pagehide after it adds nothing', (t) => {
  fresh(t);
  const { hero } = sections();
  mount(hero);
  installFlushHooks();
  installSectionTracking();
  enter(t, hero);
  t.mock.timers.tick(2_000);

  // The flush on exit sends and empties the queue, so watch what is sent.
  const sent: { event: string; path?: string | null; props?: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    sent.push(...(JSON.parse(init?.body as string) as { events: typeof sent }).events);
    return new Response(null, { status: 204 });
  });

  setVisibility('hidden');
  fireWindow('pagehide');
  assert.deepEqual(sent.map((e) => e.event), ['page_view', 'session_end']);
  assert.equal(sent[0].props?.terminal, true, 'kept: iOS may never fire pagehide');

  // Back, and read on: the continuation is a new row naming its own section.
  setVisibility('visible');
  assert.equal(currentSection(), 'hero');
  t.mock.timers.tick(3_000);
  setVisibility('hidden');
  fireWindow('pagehide');
  const views = sent.filter((e) => e.event === 'page_view');
  assert.equal(views.length, 2);
  assert.equal(views[1].props?.terminal, true, 'the later exit is the real one');
  assert.equal(views[1].props?.from, 'hero', 'from === own section marks a continuation');
  assert.equal(sent.filter((e) => e.event === 'session_end').length, 2, 'one per hidden period');
});

// ── Stacked chapters: the section on top is the one being read ──────────

test('a covered section still in the band does not keep the dwell', (t) => {
  fresh(t);
  const { hero, work } = sections();
  mount(hero, work);
  installSectionTracking();
  enter(t, hero);
  t.mock.timers.tick(2_000);
  // A sticky chapter never leaves the band once the next one covers it, so
  // hero stays intersecting. "Highest in document order" kept it active.
  enter(t, work);
  assert.equal(currentSection(), 'work');
  const views = rows('page_view');
  assert.equal(views.length, 1);
  assert.equal(views[0].path, '/#hero');
  assert.equal(views[0].props?.to, 'work');
});

// ── Scroll depth is per page ────────────────────────────────────────────

test('resetScrollDepth lets a new page report its own milestones and depth', (t) => {
  fresh(t);
  fakeDocument.documentElement.scrollHeight = 1800;
  fakeWindow.scrollY = 900; // 900 + 900 = the whole 1800px page
  installScrollTracking();
  t.mock.timers.tick(400);
  assert.deepEqual(rows('scroll_depth').map((e) => e.props?.depth), [25, 50, 75, 100]);
  fireWindow('scroll');
  t.mock.timers.tick(400);
  assert.equal(rows('scroll_depth').length, 4, 'once each, per page');
  assert.deepEqual(maxScrollReached(), { max_scroll_px: 1800, doc_h: 1800 });

  // A shorter page after a navigation.
  fakeDocument.documentElement.scrollHeight = 1200;
  fakeWindow.scrollY = 0;
  resetScrollDepth();
  t.mock.timers.tick(400);
  assert.deepEqual(rows('scroll_depth').slice(4).map((e) => e.props?.depth), [25, 50, 75]);
  assert.deepEqual(
    maxScrollReached(),
    { max_scroll_px: 900, doc_h: 1200 },
    'one page, not the max of two',
  );
});

// ── CTA impressions are per page ─────────────────────────────────────────

test('resetCtaViews re-counts a CTA seen again after a navigation', (t) => {
  fresh(t);
  const link = h('a', { 'data-track-tag': 'footer-privacy' });
  mount(link);
  installCtaVisibility();
  intersect(link, true);
  t.mock.timers.tick(1_000);
  intersect(link, false);
  intersect(link, true);
  t.mock.timers.tick(1_000);
  assert.equal(rows('cta_view').length, 1, 'once per page');

  resetCtaViews();
  intersect(link, true);
  t.mock.timers.tick(1_000);
  assert.equal(rows('cta_view').length, 2);

  // A tag that arrives later is picked up by the scanner.
  const late = h('button', { 'data-track-tag': 'chat-send' });
  mount(late);
  t.mock.timers.tick(250);
  intersect(late, true);
  t.mock.timers.tick(1_000);
  assert.deepEqual(rows('cta_view').map((e) => e.props?.tag), ['footer-privacy', 'footer-privacy', 'chat-send']);
});

test('a glance shorter than a second is not an impression', (t) => {
  fresh(t);
  const link = h('a', { 'data-track-tag': 'footer-privacy' });
  mount(link);
  installCtaVisibility();
  intersect(link, true);
  t.mock.timers.tick(500);
  intersect(link, false);
  t.mock.timers.tick(1_000);
  assert.equal(rows('cta_view').length, 0);
});

// ── Listeners only where something can be recorded ─────────────────────

test('/admin tears the listeners down, and the way back puts them up', (t) => {
  fresh(t);
  mount(h('section', { id: 'hero' }), h('a', { 'data-track-tag': 'footer-admin' }));
  installClickTracking();
  installScrollTracking();
  installSectionTracking();
  installCtaVisibility();
  syncAnalyticsRoute('/');
  assert.equal(documentListeners('click'), 1);
  assert.equal(liveObservers().intersection, 2);

  (fakeWindow.location as { pathname: string }).pathname = '/admin';
  syncAnalyticsRoute('/admin');
  assert.equal(documentListeners('click'), 0);
  assert.equal(windowListeners('scroll'), 0);
  assert.deepEqual(liveObservers(), { intersection: 0, mutation: 0 });

  (fakeWindow.location as { pathname: string }).pathname = '/';
  syncAnalyticsRoute('/');
  assert.equal(documentListeners('click'), 1);
  assert.equal(windowListeners('scroll'), 1);
  assert.deepEqual(liveObservers(), { intersection: 2, mutation: 2 });
  click(h('button', {}, 'Go'));
  assert.equal(rows('click').length, 1);
});

test('a tab that opens on /admin installs nothing until it leaves', (t) => {
  fresh(t, '/admin');
  installClickTracking();
  installScrollTracking();
  installSectionTracking();
  installCtaVisibility();
  syncAnalyticsRoute('/admin');
  assert.equal(documentListeners('click'), 0);
  assert.deepEqual(liveObservers(), { intersection: 0, mutation: 0 });

  mount(h('section', { id: 'hero' }));
  (fakeWindow.location as { pathname: string }).pathname = '/';
  syncAnalyticsRoute('/');
  assert.equal(documentListeners('click'), 1);
  assert.equal(liveObservers().intersection, 2);
});

test('an opted-out browser installs nothing', (t) => {
  fresh(t);
  local.setItem('pfInternal', '1');
  installClickTracking();
  installCtaVisibility();
  installSectionTracking();
  installScrollTracking();
  assert.equal(documentListeners('click'), 0);
  assert.equal(windowListeners('scroll'), 0);
  assert.deepEqual(liveObservers(), { intersection: 0, mutation: 0 });
});

// ── The opt-out forgets the identity ───────────────────────────────────

test('opting out deletes every id that links one visit to the next', (t) => {
  fresh(t);
  local.setItem('pfVisitorId', 'v-1');
  local.setItem('pfFirstTouch', '{"utm_source":"x"}');
  session.setItem('pfSessionId', 's-1');
  session.setItem('pfSessionStart', '1');
  session.setItem('pfLastTouch', '{"utm_source":"x"}');
  forgetAnalyticsIdentity();
  for (const key of ['pfVisitorId', 'pfFirstTouch']) assert.equal(local.getItem(key), null, key);
  for (const key of ['pfSessionId', 'pfSessionStart', 'pfLastTouch']) {
    assert.equal(session.getItem(key), null, key);
  }
});

test('first touch is no longer written, and a stored one is deleted', (t) => {
  fresh(t);
  local.setItem('pfFirstTouch', '{"utm_source":"old"}');
  (fakeWindow.location as { search: string }).search = '?utm_source=newsletter';
  fakeWindow.history = { replaceState: () => {} };
  try {
    captureAttribution();
  } finally {
    (fakeWindow.location as { search: string }).search = '';
  }
  assert.equal(local.getItem('pfFirstTouch'), null);
  assert.match(String(session.getItem('pfLastTouch')), /newsletter/, 'last touch still works');
  assert.ok(local.getItem('pfVisitorId'));
});
