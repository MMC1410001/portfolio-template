/**
 * Unit tests for the pure logic, with node:test and no framework.
 *
 *   npm run test:units
 *
 * This is why normalise.ts, section-catalogue.ts, analytics-format.ts and
 * table-sort.ts are forbidden from touching the DOM: a bare Node process can
 * import them, so the rules that are easy to get subtly wrong are checkable
 * without mounting anything.
 *
 * The cases chosen are the ones where a bug would be invisible on screen, 
 * a plausible number that is wrong. Several are regressions the source system
 * actually shipped.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting;
// the runner collects and awaits them itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ADMIN_COOKIE,
  authorizeAdmin,
  isAllowedEmail,
  issueSession,
  MIN_TOKEN_LEN,
  readSession,
  SESSION_TTL_MS,
  verifySession,
} from '../lib/analytics/admin-auth';
import {
  resetJwksCache,
  verifyGoogleIdToken,
} from '../lib/analytics/google-auth';
import {
  LOOKS_LIKE_PII,
  normalisePath,
  normalisePoint,
  normaliseQuestion,
  normaliseTag,
  normaliseUtmValue,
} from '../lib/analytics/normalise';
import {
  IST_OFFSET_MS,
  istDayKey,
  istDayStart,
  readWindow,
  resolveRange,
} from '../lib/analytics/time';
import {
  SECTION_IDS,
  sectionIdFromPath,
  sectionLabel,
} from '../lib/analytics/section-catalogue';
import {
  bucketForHost,
  clickNetwork,
  referrerHost,
  resolveSource,
} from '../lib/analytics/sources';
import { classifyUserAgent, viewportClass } from '../lib/analytics/user-agent';
import {
  expandIpv6,
  ipPrefix,
  matchesAnyCidr,
  parseCidrList,
} from '../lib/analytics/net';
import {
  normaliseUtm,
  sanitiseAttribution,
  sanitiseProps,
  validateEvent,
} from '../lib/analytics/payload';
import {
  bandWidth,
  describeInternal,
  duration,
  heatColour,
  pct,
  ratio,
  topTwoPlusOther,
} from '../components/admin/analytics-format';
import {
  ariaSort,
  compareDirectional,
  compareValues,
} from '../components/admin/table-sort';
import { edgeSectionId } from '../hooks/use-admin-section-nav';

/* ─────────────────────────── sorting ─────────────────────────── */

test('compareDirectional pins blanks to the bottom in BOTH directions', () => {
  // The regression this guards: negating a whole ascending comparator for
  // descending negates the blank rule too, floating every empty cell to the
  // top. A missing city is absent, not greater than every city.
  assert.equal(compareDirectional('a', null, 'asc'), -1);
  assert.equal(compareDirectional('a', null, 'desc'), -1);
  assert.equal(compareDirectional(null, 'a', 'asc'), 1);
  assert.equal(compareDirectional(null, 'a', 'desc'), 1);
  assert.equal(compareDirectional(null, undefined, 'desc'), 0);
});

test('compareValues orders numbers inside strings the human way', () => {
  // 192.168.0.9 before .63, lexical order would put .63 first because
  // "6" < "9". This is what makes the network column readable.
  assert.ok(compareValues('192.168.0.9/24', '192.168.0.63/24') < 0);
  // One alphabet, not two.
  assert.equal(compareValues('alice', 'Alice'), 0);
  assert.ok(compareValues(2, 10) < 0);
  assert.ok(compareValues(true, false) > 0);
});

test('ariaSort announces only the active column', () => {
  assert.equal(ariaSort({ key: 'a', dir: 'asc' }, 'a'), 'ascending');
  assert.equal(ariaSort({ key: 'a', dir: 'desc' }, 'a'), 'descending');
  assert.equal(ariaSort({ key: 'a', dir: 'asc' }, 'b'), 'none');
  assert.equal(ariaSort(null, 'a'), 'none');
});

/* ─────────────────────────── formatting ─────────────────────────── */

test('ratio returns null on a zero base, and is not clamped', () => {
  // 0% of nobody is not a rate. Rendered as 0% it reads as a broken step.
  assert.equal(ratio(0, 0), null);
  assert.equal(pct(ratio(0, 0)), 'n/a');
  assert.equal(ratio(1, 4), 25);
  // Deliberately unclamped: showing 125% beats hiding an anomaly.
  assert.equal(ratio(5, 4), 125);
});

test('duration reads as a duration', () => {
  assert.equal(duration(0), '0s');
  assert.equal(duration(-3), '0s');
  assert.equal(duration(45), '45s');
  assert.equal(duration(143.2), '2m 23s');
});

test('heatColour hits its stops exactly and clamps outside 0-1', () => {
  assert.deepEqual(heatColour(0), [30, 64, 175]);
  assert.deepEqual(heatColour(0.25), [6, 182, 212]);
  assert.deepEqual(heatColour(0.5), [34, 197, 94]);
  assert.deepEqual(heatColour(0.75), [250, 204, 21]);
  assert.deepEqual(heatColour(1), [220, 38, 38]);
  assert.deepEqual(heatColour(-5), [30, 64, 175]);
  assert.deepEqual(heatColour(99), [220, 38, 38]);
});

test('heatColour never plateaus, and interpolates between its stops', () => {
  // No single channel is monotonic across this ramp, and none should be: red
  // runs 30 -> 6 -> 34 -> 250 -> 220 as the hue sweeps blue, cyan, green,
  // yellow, red. Asserting monotonicity in a channel would be asserting
  // something the ramp was never designed to do.
  //
  // What must hold is that the ramp never flattens, a plateau makes two
  // different click densities render as the same colour, and that it
  // interpolates rather than stepping between stops.
  let previous = heatColour(0);
  for (let t = 0.02; t <= 1.0001; t += 0.02) {
    const current = heatColour(t);
    assert.notDeepEqual(current, previous, `ramp flat at t=${t.toFixed(2)}`);
    previous = current;
  }

  // Halfway between stop 0 (30,64,175) and stop 1 (6,182,212).
  assert.deepEqual(heatColour(0.125), [18, 123, 194]);
  // Halfway between stop 3 (250,204,21) and stop 4 (220,38,38).
  assert.deepEqual(heatColour(0.875), [235, 121, 30]);
});

test('describeInternal keeps all four states distinguishable', () => {
  // The two middle states show IDENTICAL totals. If they also read
  // identically, nobody can tell whether the filter is working or simply had
  // nothing to do, which is how a filtered number gets quoted as a real one.
  const states = [
    { excluded: true, sessionsMatched: 0, cidrsActive: 1, visitorsActive: 0 },
    { excluded: true, sessionsMatched: 4, cidrsActive: 1, visitorsActive: 0 },
    { excluded: false, sessionsMatched: 0, cidrsActive: 1, visitorsActive: 0 },
    { excluded: false, sessionsMatched: 4, cidrsActive: 1, visitorsActive: 0 },
  ];
  const headlines = states.map((s) => describeInternal(s)?.headline);
  assert.equal(new Set(headlines).size, 4);
  // Warn only when internal traffic is inside the numbers on screen.
  assert.equal(describeInternal(states[3])?.tone, 'warn');
  assert.equal(describeInternal(states[2])?.tone, 'muted');
  assert.equal(describeInternal(states[1])?.tone, 'muted');
  assert.equal(describeInternal(undefined), null);
});

test('topTwoPlusOther folds only past three', () => {
  const row = (label: string, n: number) => ({
    label,
    sessions: n,
    share: n,
  });
  const three = [row('a', 3), row('b', 2), row('c', 1)];
  assert.deepEqual(topTwoPlusOther(three), three);

  const four = [...three, row('d', 4)];
  const folded = topTwoPlusOther(four);
  assert.equal(folded.length, 3);
  assert.equal(folded[2].label, 'Other');
  assert.equal(folded[2].sessions, 5);
});

test('bandWidth floors a real-but-tiny step at a visible mark', () => {
  assert.equal(bandWidth(0, 0), 0);
  assert.equal(bandWidth(1, 10_000), 2);
  assert.equal(bandWidth(5, 10), 50);
  assert.equal(bandWidth(20, 10), 100);
});

/* ─────────────────────────── time, in IST ─────────────────────────── */

test('istDayKey lands on the right side of the 18:30 UTC boundary', () => {
  // The exact case the source system got wrong: SQL's 'localtime' resolved
  // against a UTC server, so everything between 00:00 and 05:30 IST counted
  // against the previous day.
  //
  // 2026-03-10T20:30:00Z is 2026-03-11 02:00 IST, the NEXT day.
  assert.equal(istDayKey(Date.parse('2026-03-10T20:30:00Z')), '2026-03-11');
  // 2026-03-10T18:29:00Z is still 2026-03-10 23:59 IST.
  assert.equal(istDayKey(Date.parse('2026-03-10T18:29:00Z')), '2026-03-10');
  // And the boundary itself.
  assert.equal(istDayKey(Date.parse('2026-03-10T18:30:00Z')), '2026-03-11');
});

test('istDayStart is the IST midnight containing the instant', () => {
  const at = Date.parse('2026-03-10T20:30:00Z'); // 02:00 IST on the 11th
  const start = istDayStart(at);
  assert.equal(istDayKey(start), '2026-03-11');
  // Exactly midnight IST, i.e. 18:30 UTC the previous day.
  assert.equal(new Date(start).toISOString(), '2026-03-10T18:30:00.000Z');
  assert.ok(start <= at);
  assert.equal((start + IST_OFFSET_MS) % 86_400_000, 0);
});

test('resolveRange: today and yesterday are IST calendar days', () => {
  const now = Date.parse('2026-03-10T20:30:00Z'); // 02:00 IST on the 11th
  const today = resolveRange('today', now);
  assert.equal(istDayKey(today.since), '2026-03-11');
  assert.equal(today.until, now);

  const yesterday = resolveRange('yesterday', now);
  assert.equal(istDayKey(yesterday.since), '2026-03-10');
  assert.equal(istDayKey(yesterday.until), '2026-03-10');
  // Inclusive to the last millisecond, so the final second is not dropped.
  assert.equal(yesterday.until - yesterday.since, 86_399_999);
});

test('resolveRange: 7d/30d/90d stay rolling, not calendar', () => {
  const now = Date.parse('2026-03-10T20:30:00Z');
  for (const [id, days] of [
    ['7d', 7],
    ['30d', 30],
    ['90d', 90],
  ] as const) {
    const w = resolveRange(id, now);
    assert.equal(w.until, now);
    assert.equal(now - w.since, days * 86_400_000);
  }
});

test('resolveRange: an inverted custom range is sorted, not empty', () => {
  // A picker is easily left with `to` before `from` mid-edit, and an inverted
  // range does not error, it returns nothing, which reads as "no traffic".
  const now = Date.parse('2026-03-10T20:30:00Z');
  const w = resolveRange('custom', now, { from: '2026-03-09', to: '2026-03-01' });
  assert.equal(istDayKey(w.since), '2026-03-01');
  assert.equal(istDayKey(w.until), '2026-03-09');
  assert.ok(w.since < w.until);
});

test('readWindow sorts an inverted pair and caps the span', () => {
  const w = readWindow({ from: 2_000, to: 1_000 });
  assert.equal(w.since, 1_000);
  assert.equal(w.until, 2_000);

  const huge = readWindow({ from: 0, to: Date.parse('2026-03-10T00:00:00Z') });
  assert.ok(huge.days <= 366, `${huge.days} days exceeded the cap`);
});

/* ─────────────────────────── normalising ─────────────────────────── */

test('normaliseUtmValue lowercases, rejects PII, and never truncates', () => {
  // One row, not three.
  assert.equal(normaliseUtmValue('WhatsApp'), 'whatsapp');
  assert.equal(normaliseUtmValue('Community message'), 'community-message');
  assert.equal(normaliseUtmValue('Community+message'), 'community-message');
  // Dropped whole: a scrubbed value still reads as a plausible campaign.
  assert.equal(normaliseUtmValue('ravi@gmail.com'), null);
  assert.equal(normaliseUtmValue('ravi%40gmail.com'), null);
  assert.equal(normaliseUtmValue('9876543210'), null);
  // Rejected, not clipped, a clipped name is a different campaign.
  assert.equal(normaliseUtmValue('x'.repeat(65)), null);
  assert.equal(normaliseUtmValue('x'.repeat(64)), 'x'.repeat(64));
  // Both ends must agree on stripping a leading underscore, or a campaign
  // appears in one report and is missing from the other with no error.
  assert.equal(normaliseUtmValue('_promo'), 'promo');
  assert.equal(normaliseUtm('_promo'), 'promo');
  assert.equal(normaliseUtm('WhatsApp'), 'whatsapp');
  assert.equal(normaliseUtm('ravi%40gmail.com'), null);
});

test('normaliseQuestion refuses text without refusing the event', () => {
  // The load-bearing rule: a rejection returns a REASON, so volume and guard
  // rates survive even when the words do not.
  for (const [input, reason] of [
    ['email me at a@b.com', 'pii'],
    ['reach me on a%40b.com', 'pii'],
    ['call 9876543210', 'pii'],
    ['see https://example.com', 'url'],
    ['see www.example.com', 'url'],
    ['x'.repeat(121), 'length'],
    ['hi', 'short'],
  ] as const) {
    const out = normaliseQuestion(input);
    assert.equal(out.q, null, `expected ${input} to be withheld`);
    assert.equal(out.rejected, reason);
  }

  const ok = normaliseQuestion('  What   is his TECH stack? ');
  assert.equal(ok.q, 'what is his tech stack?');
  assert.equal(ok.rejected, null);
});

test('LOOKS_LIKE_PII is tested before any trimming', () => {
  // %40 must be caught in its encoded form, exactly as the client catches it.
  assert.ok(LOOKS_LIKE_PII.test('a%40b'));
  assert.ok(LOOKS_LIKE_PII.test('a@b'));
  assert.ok(LOOKS_LIKE_PII.test('1234567'));
  assert.ok(!LOOKS_LIKE_PII.test('123456'));
});

test('normaliseTag folds to one value space', () => {
  assert.equal(normaliseTag('Hero-CTA'), 'hero-cta');
  assert.equal(normaliseTag('hero  cta'), 'hero-cta');
  assert.equal(normaliseTag('hero__cta'), 'hero-cta');
  assert.equal(normaliseTag('--hero--cta--'), 'hero-cta');
  assert.equal(normaliseTag('x'.repeat(41)), null);
  assert.equal(normaliseTag(''), null);
});

test('normalisePath and section resolution', () => {
  assert.equal(normalisePath('/'), '/');
  assert.equal(normalisePath(''), '/');
  assert.equal(normalisePath('/admin/'), '/admin');
  assert.equal(sectionIdFromPath('/#work'), 'work');
  assert.equal(sectionIdFromPath('work'), 'work');
  // An id outside the catalogue must not become a row.
  assert.equal(sectionIdFromPath('/#injected'), null);
  assert.ok(SECTION_IDS.has('certifications'));
  assert.equal(sectionLabel('/#notes'), 'Learning');
  // Unknown ids return themselves rather than something reassuring.
  assert.equal(sectionLabel('mystery'), 'mystery');
});

test('normalisePoint clamps to the unit square at 5dp', () => {
  assert.deepEqual(normalisePoint(720, 6000, 1440, 12000), {
    x_pct: 0.5,
    y_pct: 0.5,
  });
  assert.deepEqual(normalisePoint(-50, -50, 1440, 12000), {
    x_pct: 0,
    y_pct: 0,
  });
  assert.deepEqual(normalisePoint(99_999, 99_999, 1440, 12000), {
    x_pct: 1,
    y_pct: 1,
  });
  assert.equal(normalisePoint(1, 3, 3, 7).x_pct, 0.33333);
});

/* ─────────────────────────── traffic sources ─────────────────────────── */

test('an ad click resolves BEFORE its referrer', () => {
  // A paid click arrives *from* google.com. Referrer-first bucketing files
  // every ad as organic search, which is the wrong answer in the direction
  // that costs money.
  const paid = resolveSource({
    utm_source: null,
    utm_medium: null,
    click_id_source: 'gclid',
    referrer_host: 'google.com',
  });
  assert.equal(paid.source, 'google_ads');
  assert.equal(paid.medium, 'cpc');
  assert.equal(paid.tagged, 'ad');

  // With no click id, the same referrer is organic.
  const organic = resolveSource({
    utm_source: null,
    utm_medium: null,
    click_id_source: null,
    referrer_host: 'google.com',
  });
  assert.equal(organic.medium, 'organic');
  assert.equal(organic.tagged, 'referrer');

  // And an explicit utm_source wins over both.
  assert.equal(
    resolveSource({
      utm_source: 'newsletter',
      utm_medium: 'email',
      click_id_source: 'gclid',
      referrer_host: 'google.com',
    }).source,
    'newsletter',
  );

  assert.equal(
    resolveSource({
      utm_source: null,
      utm_medium: null,
      click_id_source: null,
      referrer_host: null,
    }).source,
    '(direct)',
  );
});

test('referrer hosts bucket by longest suffix match', () => {
  assert.equal(referrerHost('https://www.google.com/search?q=x'), 'google.com');
  assert.equal(referrerHost(null), null);
  assert.equal(referrerHost('not a url'), null);
  assert.equal(bucketForHost('google.com'), 'organic');
  assert.equal(bucketForHost('news.ycombinator.com'), 'social');
  assert.equal(bucketForHost('gemini.google.com'), 'ai');
  assert.equal(bucketForHost('chatgpt.com'), 'ai');
  assert.equal(bucketForHost('example.org'), 'referral');
  assert.equal(bucketForHost(null), 'direct');
  assert.equal(clickNetwork('fbclid'), 'meta');
  assert.equal(clickNetwork(null), null);
});

/* ─────────────────────────── user agent ─────────────────────────── */

test('bots are classified before Chrome', () => {
  // Headless Chrome carries "Chrome". Testing Chrome first files automated
  // traffic as real visitors and inflates every session count.
  assert.equal(
    classifyUserAgent('Mozilla/5.0 HeadlessChrome/120 Safari/537').browser,
    'Bot',
  );
  assert.equal(classifyUserAgent('Googlebot/2.1').browser, 'Bot');
});

test('an iPad in desktop mode is still a tablet', () => {
  // Desktop-mode Safari on an iPad reports "macintosh".
  const ipad = classifyUserAgent(
    'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Version/17.0 Safari/605',
  );
  assert.equal(ipad.device, 'tablet');
  assert.equal(ipad.os, 'iOS');
});

test('Chrome-family browsers are not all "Chrome"', () => {
  assert.equal(classifyUserAgent('… Chrome/120 … Edg/120').browser, 'Edge');
  assert.equal(classifyUserAgent('… Chrome/120 … OPR/106').browser, 'Opera');
  assert.equal(
    classifyUserAgent('… SamsungBrowser/23 … Chrome/115').browser,
    'Samsung Internet',
  );
  // Safari only after Chrome: every Chrome UA also says "safari".
  assert.equal(
    classifyUserAgent(
      'Mozilla/5.0 (Macintosh) AppleWebKit Version/17 Safari/605',
    ).browser,
    'Safari',
  );
  assert.deepEqual(classifyUserAgent(null), {
    device: null,
    browser: null,
    os: null,
  });
});

test('viewportClass prefers the measured viewport over the UA label', () => {
  // Must stay identical to the heatmap query's CASE, or the picker count and
  // the canvas contradict each other on screen.
  assert.equal(viewportClass(390, 'desktop'), 'mobile');
  assert.equal(viewportClass(834, 'mobile'), 'tablet');
  assert.equal(viewportClass(1440, null), 'desktop');
  assert.equal(viewportClass(599, null), 'mobile');
  assert.equal(viewportClass(600, null), 'tablet');
  assert.equal(viewportClass(1023, null), 'tablet');
  assert.equal(viewportClass(1024, null), 'desktop');
  // No viewport: fall back to what the UA said.
  assert.equal(viewportClass(null, 'mobile'), 'mobile');
});

/* ─────────────────────────── networks ─────────────────────────── */

test('parseCidrList refuses anything broader than /16', () => {
  // A stray /0 would mark every visitor internal and zero the whole panel, 
  // and the failure presents as "no traffic", not as an error.
  assert.equal(parseCidrList('0.0.0.0/0').length, 0);
  assert.equal(parseCidrList('10.0.0.0/8').length, 0);
  assert.equal(parseCidrList('10.0.0.0/16').length, 1);
  assert.equal(parseCidrList('nonsense').length, 0);
  assert.equal(parseCidrList('203.0.113.0/24,10.0.0.0/8').length, 1);
  assert.equal(parseCidrList(undefined).length, 0);
});

test('matchesAnyCidr matches inside the prefix and not outside', () => {
  const list = parseCidrList('203.0.113.0/24');
  assert.ok(matchesAnyCidr('203.0.113.47', list));
  assert.ok(!matchesAnyCidr('203.0.114.47', list));
  // A v4 address must never match a v6 rule.
  assert.ok(!matchesAnyCidr('203.0.113.47', parseCidrList('2405:201::/32')));
});

test('ipPrefix coarsens, and never returns the address', () => {
  assert.equal(ipPrefix('203.0.113.47'), '203.0.113.0/24');
  assert.equal(ipPrefix('2405:201:1234:5678::1'), '2405:0201:1234::/48');
  assert.equal(ipPrefix('garbage'), null);
  assert.deepEqual(expandIpv6('::1')?.length, 8);
});

/* ─────────────────────────── payload validation ─────────────────────────── */

test('sanitiseProps drops nesting whole and caps size', () => {
  // Nesting is how a byte cap gets defeated, and nothing reading the column
  // needs it.
  const out = sanitiseProps({ tag: 'nav-home', nested: { a: 1 }, list: [1] });
  assert.deepEqual(out, { tag: 'nav-home' });

  // Key cap.
  const many: Record<string, number> = {};
  for (let i = 0; i < 40; i += 1) many[`k${i}`] = i;
  assert.equal(Object.keys(sanitiseProps(many) ?? {}).length, 20);

  // Byte cap returns null rather than a partial object.
  assert.equal(sanitiseProps({ a: 'x'.repeat(300), b: 'y'.repeat(300), c: 'z'.repeat(300), d: 'w'.repeat(300), e: 'v'.repeat(300), f: 'u'.repeat(300), g: 't'.repeat(300) }), null);
  assert.equal(sanitiseProps(null), null);
  assert.equal(sanitiseProps([1, 2]), null);
});

test('an unpaired click id is discarded, since half a fact is unreadable', () => {
  const paired = sanitiseAttribution({
    click_id: 'abc123',
    click_id_source: 'gclid',
  });
  assert.equal(paired?.click_id, 'abc123');

  const unpaired = sanitiseAttribution({ click_id: 'abc123' });
  assert.equal(unpaired?.click_id ?? null, null);

  const noId = sanitiseAttribution({ click_id_source: 'gclid' });
  assert.equal(noId, null);

  // A visitor id must look like a UUID, or a caller could invent a visitor
  // whose sessions roll up together.
  assert.equal(sanitiseAttribution({ visitor_id: 'mine' }), null);
  assert.equal(
    sanitiseAttribution({
      visitor_id: '11111111-1111-4111-8111-111111111111',
    })?.visitor_id,
    '11111111-1111-4111-8111-111111111111',
  );
});

test('validateEvent allowlists the verb, the section and the mode', () => {
  assert.equal(validateEvent({ event: 'not_real' }), null);

  const injected = validateEvent({
    event: 'click',
    path: '/',
    props: { section: 'injected', mode: 'hacked' },
  });
  // Dropped to null rather than inventing a section or a mode.
  assert.equal(injected?.section, null);
  assert.equal(injected?.mode, null);

  const real = validateEvent({
    event: 'click',
    path: '/',
    props: { section: 'contact', mode: 'immersive' },
  });
  assert.equal(real?.section, 'contact');
  assert.equal(real?.mode, 'immersive');

  // A page_view carries its section in the path.
  assert.equal(validateEvent({ event: 'page_view', path: '/#notes' })?.section, 'notes');

  // The point kind is derived from the validated verb, so a client cannot
  // label a dead click as a real one.
  const dead = validateEvent({
    event: 'dead_click',
    path: '/',
    point: { x_pct: 0.5, y_pct: 0.5, doc_h: 12000, selector: null },
  });
  assert.equal(dead?.point?.kind, 'dead');
  // A verb that carries no coordinate never produces a point row.
  assert.equal(
    validateEvent({
      event: 'scroll_depth',
      path: '/',
      point: { x_pct: 0.5, y_pct: 0.5 },
    })?.point,
    null,
  );
});

/* ─────────────────────────── nav ─────────────────────────── */

test('edgeSectionId snaps at the very top and very bottom', () => {
  // A short final panel may never occupy the observer's band, so without this
  // the highlight sticks on the second-to-last section forever.
  const ids = ['a', 'b', 'c'];
  assert.equal(edgeSectionId(ids, 0, 800, 5000), 'a');
  assert.equal(edgeSectionId(ids, 4200, 800, 5000), 'c');
  assert.equal(edgeSectionId(ids, 2000, 800, 5000), null);
  assert.equal(edgeSectionId([], 0, 800, 5000), null);
});

/* ───────────────────── the admin gate's trust boundary ───────────────────── */

/**
 * The `oai-authenticated-user-email` header must be ignored by default.
 *
 * This is the regression test for a live privilege escalation. The header is
 * only trustworthy if something in front of the app strips inbound copies, 
 * a property of the *host*, not of this code. On OpenAI Sites the ingress
 * does it; on a plain Cloudflare Worker nothing does.
 *
 * What made it exploitable rather than theoretical: `content/portfolio.ts`
 * prints the owner's email in the contact section, and that same address is
 * in `ADMIN_EMAILS`. So the "secret" the allowlist checks is published on the
 * homepage. Serving the built Worker with ADMIN_EMAILS set and sending the
 * header by hand returned the whole dashboard with HTTP 200.
 *
 * These tests mutate process.env and restore it, because the gate reads the
 * environment on every call by design, a Worker isolate can outlive a config
 * change, so caching the verdict would keep a stale one.
 */
async function withEnv(
  vars: Record<string, string | undefined>,
  // Awaited, because authorizeAdmin became async when the cookie became a
  // signed session. A sync-only helper would restore the environment in its
  // `finally` while the assertions were still pending, and every one of these
  // tests would then be reading whatever env the next test had set.
  run: () => void | Promise<void>,
) {
  const saved = new Map<string, string | undefined>();
  for (const key of Object.keys(vars)) {
    saved.set(key, process.env[key]);
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    await run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const forged = (email: string) =>
  new Request('https://example.test/api/admin/analytics', {
    method: 'POST',
    headers: { 'oai-authenticated-user-email': email },
  });

test('a forged platform header is refused when trust is not declared', async () => {
  await withEnv(
    {
      ADMIN_EMAILS: 'owner@example.com',
      TRUST_PLATFORM_AUTH_HEADER: undefined,
      ADMIN_TOKEN: undefined,
    },
    async () => {
      assert.equal(await authorizeAdmin(forged('owner@example.com')), null);
    },
  );
});

test('an allowlisted platform header works only once trust is declared', async () => {
  await withEnv(
    {
      ADMIN_EMAILS: 'owner@example.com',
      TRUST_PLATFORM_AUTH_HEADER: '1',
      ADMIN_TOKEN: undefined,
    },
    async () => {
      assert.deepEqual(await authorizeAdmin(forged('owner@example.com')), {
        via: 'platform',
        who: 'owner@example.com',
      });
      // Membership, not presence: a signed-in stranger is still not an admin.
      assert.equal(await authorizeAdmin(forged('someone@else.com')), null);
    },
  );
});

test('the token path is unaffected by the platform trust flag', async () => {
  const token = 'x'.repeat(48);
  const bearer = () =>
    new Request('https://example.test/api/admin/analytics', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });

  for (const flag of [undefined, '1']) {
    await withEnv(
      { ADMIN_TOKEN: token, TRUST_PLATFORM_AUTH_HEADER: flag, ADMIN_EMAILS: '' },
      async () => {
        assert.deepEqual(await authorizeAdmin(bearer()), {
          via: 'token',
          who: 'token',
        });
      },
    );
  }
});

test('a token shorter than MIN_TOKEN_LEN is ignored, not merely weak', async () => {
  // The whole branch is skipped below the floor, so even the correct value
  // fails, which is what made an 11-character ADMIN_TOKEN look like a broken
  // sign-in form rather than a rejected credential.
  const short = 'a1b2c3d4e5f';
  assert.ok(short.length < MIN_TOKEN_LEN);
  await withEnv(
    { ADMIN_TOKEN: short, TRUST_PLATFORM_AUTH_HEADER: undefined },
    async () => {
      const request = new Request('https://example.test/api/admin/analytics', {
        method: 'POST',
        headers: { authorization: `Bearer ${short}` },
      });
      assert.equal(await authorizeAdmin(request), null);
    },
  );
});

/**
 * The admin cookie is a signed session, not the token.
 *
 * The regression these guard is the one the cookie used to be: `pa_admin` held
 * ADMIN_TOKEN verbatim, so the value in a browser jar WAS the master
 * credential, `Max-Age` was the only expiry and the server never checked it,
 * and there was no way to end a session short of rotating the env var.
 */
const cookied = (value: string) =>
  new Request('https://example.test/api/admin/analytics', {
    method: 'POST',
    headers: { cookie: `${ADMIN_COOKIE}=${encodeURIComponent(value)}` },
  });

test('a signed session cookie authorises', async () => {
  const token = 'y'.repeat(48);
  await withEnv({ ADMIN_TOKEN: token, ADMIN_EMAILS: '' }, async () => {
    assert.deepEqual(await authorizeAdmin(cookied(await issueSession(token))), {
      via: 'token',
      who: 'token',
    });
  });
});

test('the raw ADMIN_TOKEN is no longer accepted as a cookie', async () => {
  const token = 'y'.repeat(48);
  await withEnv({ ADMIN_TOKEN: token, ADMIN_EMAILS: '' }, async () => {
    // Still valid as Bearer, that path is curl, CI and the retention cron.
    assert.equal(await authorizeAdmin(cookied(token)), null);
  });
});

test('an expired session is refused even though it is correctly signed', async () => {
  const token = 'y'.repeat(48);
  const stale = await issueSession(token, Date.now() - SESSION_TTL_MS - 1000);
  assert.equal(await verifySession(stale, token), false);
  await withEnv({ ADMIN_TOKEN: token, ADMIN_EMAILS: '' }, async () => {
    assert.equal(await authorizeAdmin(cookied(stale)), null);
  });
});

test('a tampered expiry does not survive the signature', async () => {
  const token = 'y'.repeat(48);
  const issued = await issueSession(token);
  const sig = issued.slice(issued.indexOf('.') + 1);
  // Push the deadline out by a year, keeping the signature that was minted
  // for the original one.
  const forgedValue = `${Date.now() + 31_536_000_000}.${sig}`;
  assert.equal(await verifySession(forgedValue, token), false);
});

test('rotating ADMIN_TOKEN invalidates outstanding sessions', async () => {
  const issued = await issueSession('y'.repeat(48));
  assert.equal(await verifySession(issued, 'z'.repeat(48)), false);
});

/**
 * ── Google sign-in ─────────────────────────────────────────────────────────
 *
 * These sign real JWTs with a throwaway RSA key and stub the JWKS endpoint, so
 * the signature path is genuinely exercised rather than mocked past. That is
 * the half that matters: every other check in `verifyGoogleIdToken` reads the
 * payload, and the payload is only meaningful once the signature has held.
 */
const KID = 'test-key';

async function googleFixture() {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;

  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const keys = [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }];

  const b64 = (value: string) =>
    btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const mint = async (claims: Record<string, unknown>, alg = 'RS256') => {
    const body = `${b64(JSON.stringify({ alg, kid: KID }))}.${b64(
      JSON.stringify(claims),
    )}`;
    const sig = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      pair.privateKey,
      new TextEncoder().encode(body),
    );
    let binary = '';
    for (const byte of new Uint8Array(sig)) binary += String.fromCharCode(byte);
    return `${body}.${b64(binary)}`;
  };

  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ keys }), {
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
  resetJwksCache();

  return { mint, restore: () => { globalThis.fetch = original; resetJwksCache(); } };
}

const claimsFor = (over: Record<string, unknown> = {}) => ({
  iss: 'https://accounts.google.com',
  aud: 'client-123.apps.googleusercontent.com',
  email: 'owner@example.com',
  email_verified: true,
  iat: Math.floor(Date.now() / 1000) - 10,
  exp: Math.floor(Date.now() / 1000) + 600,
  ...over,
});

test('a correctly signed Google token yields the identity', async () => {
  const g = await googleFixture();
  try {
    const token = await g.mint(claimsFor());
    assert.deepEqual(
      await verifyGoogleIdToken(token, 'client-123.apps.googleusercontent.com'),
      { ok: true, identity: { email: 'owner@example.com', hd: null } },
    );
  } finally {
    g.restore();
  }
});

test('a Google token minted for ANOTHER app is refused', async () => {
  // The one check that is easy to omit and fatal to omit: without `aud`, an ID
  // token from any other Google application verifies perfectly and names a
  // real user.
  const g = await googleFixture();
  try {
    const token = await g.mint(claimsFor({ aud: 'someone-else.apps.googleusercontent.com' }));
    assert.deepEqual(
      await verifyGoogleIdToken(token, 'client-123.apps.googleusercontent.com'),
      { ok: false, reason: 'wrong-audience' },
    );
  } finally {
    g.restore();
  }
});

test('Google tokens are refused on every other claim, one at a time', async () => {
  const g = await googleFixture();
  const id = 'client-123.apps.googleusercontent.com';
  try {
    // Each names its own reason, so a future change that makes one fail for the
    // *wrong* reason is caught rather than passing as "still refused".
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['a foreign issuer', { iss: 'https://evil.test' }, 'bad-issuer'],
      ['an expired token', { exp: Math.floor(Date.now() / 1000) - 3600 }, 'expired'],
      ['a token issued in the future', { iat: Math.floor(Date.now() / 1000) + 3600 }, 'expired'],
      ['an unverified email', { email_verified: false }, 'unverified-email'],
      ['no email at all', { email: undefined }, 'unverified-email'],
    ];
    for (const [label, over, reason] of cases) {
      const token = await g.mint(claimsFor(over));
      assert.deepEqual(await verifyGoogleIdToken(token, id), { ok: false, reason }, label);
    }
  } finally {
    g.restore();
  }
});

test('alg:none is refused before any key is consulted', async () => {
  // Refused on shape, so it must not even reach the JWKS fetch.
  let fetched = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetched = true;
    return new Response('{}');
  }) as typeof fetch;
  resetJwksCache();
  try {
    const b64 = (v: string) =>
      btoa(v).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const forgedToken = `${b64(JSON.stringify({ alg: 'none', kid: KID }))}.${b64(
      JSON.stringify(claimsFor()),
    )}.`;
    assert.deepEqual(
      await verifyGoogleIdToken(forgedToken, 'client-123.apps.googleusercontent.com'),
      { ok: false, reason: 'bad-alg' },
    );
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = original;
    resetJwksCache();
  }
});

test('a v2 session round-trips the email, and will not carry a tampered one', async () => {
  const token = 'x'.repeat(48);
  const issued = await issueSession(token, Date.now(), 'Owner@Example.com');
  // Normalised at issue time, so the allowlist compare has one case to handle.
  assert.deepEqual(await readSession(issued, token), { who: 'owner@example.com' });

  const [expires, sig] = issued.split('.');
  const swapped = btoa('someone@else.com')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  assert.equal(await readSession(`${expires}.${swapped}.${sig}`, token), null);
});

test('a v1 session still verifies, and still reads as the token identity', async () => {
  const token = 'x'.repeat(48);
  const issued = await issueSession(token);
  assert.equal(issued.split('.').length, 2);
  assert.deepEqual(await readSession(issued, token), { who: 'token' });
});

test('a Google session is revoked by removing the email from ADMIN_EMAILS', async () => {
  const token = 'x'.repeat(48);
  const cookie = await issueSession(token, Date.now(), 'owner@example.com');
  const request = () =>
    new Request('https://example.test/api/admin/analytics', {
      method: 'POST',
      headers: { cookie: `${ADMIN_COOKIE}=${encodeURIComponent(cookie)}` },
    });

  await withEnv(
    { ADMIN_TOKEN: token, ADMIN_EMAILS: 'owner@example.com' },
    async () => {
      assert.deepEqual(await authorizeAdmin(request()), {
        via: 'google',
        who: 'owner@example.com',
      });
    },
  );

  // Same cookie, same signature, still inside its 12 hours, and refused,
  // because the allowlist is read per request rather than trusted from issue.
  await withEnv(
    { ADMIN_TOKEN: token, ADMIN_EMAILS: 'someone@else.com' },
    async () => {
      assert.equal(await authorizeAdmin(request()), null);
    },
  );
});

test('isAllowedEmail is membership, case-folded, and empty admits nobody', async () => {
  await withEnv({ ADMIN_EMAILS: 'a@x.com, B@X.com' }, () => {
    assert.ok(isAllowedEmail('a@x.com'));
    assert.ok(isAllowedEmail('  b@x.com  '));
    assert.ok(!isAllowedEmail('c@x.com'));
  });
  await withEnv({ ADMIN_EMAILS: '' }, () => {
    assert.ok(!isAllowedEmail('a@x.com'));
  });
});
