/**
 * Analytics ingest + admin API checks, in the style of tests/chat.mjs:
 * a bare Node script against a live dev server, no framework.
 *
 *   npm run dev                # in one terminal
 *   ADMIN_TOKEN=<32+ chars> npm run test:analytics
 *
 * The ADMIN_TOKEN must match the one the server was started with, and
 * ANALYTICS_IP_SALT must be set for ingest to write at all, the route refuses
 * without it on purpose.
 */
import { randomUUID } from 'node:crypto';

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const token = process.env.ADMIN_TOKEN || '';

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? `: ${detail}` : ''}`);
}

async function track(body, headers = {}) {
  const response = await fetch(`${base}/api/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    /* a 413 has no JSON body */
  }
  return { status: response.status, json };
}

async function admin(action, extra = {}) {
  const response = await fetch(`${base}/api/admin/analytics`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...extra }),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    /* 404 body is text */
  }
  return { status: response.status, json };
}

const session = randomUUID();
const visitor = randomUUID();

// ── ingest ──────────────────────────────────────────────────────────────────

let r = await track({
  session_id: session,
  event: 'visit',
  path: '/',
  referrer: 'https://www.google.com/search?q=alex',
  props: { reduced_motion: false },
  attribution: {
    utm_source: 'LinkedIn',
    utm_medium: 'Profile',
    utm_campaign: 'portfolio%40launch',
    visitor_id: visitor,
  },
});
check('visit accepted', r.status === 200 && r.json?.ok === true, JSON.stringify(r.json));

// The campaign name contained %40, which the PII screen must reject WHOLE
// while leaving the other campaign fields intact.
r = await track({
  session_id: session,
  events: [
    { event: 'page_view', path: '/#hero', duration_ms: 4200, seq: 1, props: { from: null, to: 'work', mode: 'resume', doc_h: 12000 } },
    { event: 'page_view', path: '/#work', duration_ms: 9100, seq: 2, props: { from: 'hero', to: 'about', mode: 'resume', doc_h: 12000 } },
    { event: 'scroll_depth', seq: 3, props: { depth: 25, doc_h: 12000, section: 'work', mode: 'resume' } },
    { event: 'scroll_depth', seq: 4, props: { depth: 50, doc_h: 12000, section: 'about', mode: 'resume' } },
    { event: 'cta_view', seq: 5, props: { tag: 'contact-email', section: 'contact', mode: 'resume' } },
    { event: 'click', seq: 6, props: { tag: 'contact-email', selector: 'contact-email', section: 'contact', mode: 'resume' }, viewport_w: 1440, viewport_h: 900, point: { x_pct: 0.42, y_pct: 0.81, doc_h: 12000, selector: 'contact-email' } },
    { event: 'dead_click', seq: 7, props: { selector: 'div:hero', section: 'hero', mode: 'resume' }, viewport_w: 1440, point: { x_pct: 0.1, y_pct: 0.05, doc_h: 12000, selector: null } },
    { event: 'chat_open', seq: 8, props: { trigger: 'launcher', section: 'contact', mode: 'resume' } },
    { event: 'chat_ask', seq: 9, props: { q: 'what is his tech stack', q_len: 22, rejected: null, prompt_index: 1, turn: 1, section: 'contact', mode: 'resume' } },
    { event: 'chat_answer', seq: 10, props: { source: 'From the portfolio', answer_mode: 'faq', offline: false, failure: null, latency_ms: 140, turn: 1 } },
    { event: 'chat_ask', seq: 11, props: { q: null, q_len: 31, rejected: 'pii', prompt_index: null, turn: 2 } },
    { event: 'chat_answer', seq: 12, props: { source: 'Not documented', answer_mode: 'faq', offline: false, failure: null, latency_ms: 90, turn: 2 } },
    { event: 'chat_close', seq: 13, props: { asked: 2, answered: 2, dwell_ms: 22000, last_source: 'Not documented' } },
    { event: 'mode_change', seq: 14, props: { from: 'resume', to: 'immersive', trigger: 'idle', dwell_ms: 10000 } },
    { event: 'page_view', path: '/#contact', duration_ms: 6000, seq: 15, props: { from: 'about', to: null, mode: 'immersive', terminal: true, doc_h: 12000 } },
    { event: 'session_end', seq: 16, duration_ms: 41000, props: { exit_section: 'contact', resume_ms: 30000, immersive_ms: 11000, mode_changes: 1, max_scroll_px: 7400, doc_h: 12000 } },
  ],
});
check('batch accepted', r.status === 200 && r.json?.written === 16, JSON.stringify(r.json));

r = await track({ session_id: session, events: [{ event: 'not_a_real_verb' }] });
check('unknown verb dropped, not 500', r.status === 200 && r.json?.ok === false && r.json?.reason === 'no_events', JSON.stringify(r.json));

r = await track({ session_id: session, events: [] });
check('empty batch refused with 200', r.status === 200 && r.json?.ok === false, JSON.stringify(r.json));

r = await track({ session_id: 'not-a-uuid', event: 'visit' });
check('bad session id refused with 200', r.status === 200 && r.json?.reason === 'bad_session_id', JSON.stringify(r.json));

r = await track('{"session_id":');
check('malformed JSON refused with 200', r.status === 200 && r.json?.reason === 'bad_json', JSON.stringify(r.json));

r = await track({ session_id: session, event: 'visit', props: { pad: 'x'.repeat(40000) } });
check('oversized body -> 413', r.status === 413, `status ${r.status}`);

// sendBeacon posts text/plain; the route must read it the same way.
r = await track(JSON.stringify({ session_id: session, events: [{ event: 'click', props: { tag: 'back-to-top' } }] }), { 'Content-Type': 'text/plain;charset=UTF-8' });
check('text/plain beacon body accepted', r.status === 200 && r.json?.ok === true, JSON.stringify(r.json));

// Deeply nested props are dropped whole, not truncated, and the event still
// lands, because a bad prop must not cost the measurement.
r = await track({ session_id: session, events: [{ event: 'click', props: { nested: { a: 1 }, tag: 'nav-home' } }] });
check('nested props survive as a dropped key', r.status === 200 && r.json?.written === 1, JSON.stringify(r.json));

// ── admin gate ──────────────────────────────────────────────────────────────

const noAuth = await fetch(`${base}/api/admin/analytics`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'analytics' }),
});
check('unauthenticated admin -> 404', noAuth.status === 404, `status ${noAuth.status}`);

const forged = await fetch(`${base}/api/admin/analytics`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'oai-authenticated-user-email': 'attacker@example.com',
  },
  body: JSON.stringify({ action: 'analytics' }),
});
check('non-allowlisted email header -> 404', forged.status === 404, `status ${forged.status}`);

if (!token) {
  console.log('ADMIN_TOKEN unset, skipping the authenticated admin checks.');
} else {
  const who = await admin('whoami');
  check('whoami authorised', who.status === 200, JSON.stringify(who.json));
  check('D1 binding resolved', who.json?.db?.resolved === true, JSON.stringify(who.json?.db));

  const ov = await admin('analytics', { range: '30d', excludeInternal: false });
  check('overview 200', ov.status === 200, JSON.stringify(ov.json).slice(0, 300));
  const o = ov.json ?? {};
  for (const key of ['meta', 'internal', 'funnel', 'engagement', 'sections', 'clicks', 'scroll', 'ctas', 'friction', 'exitClicks', 'devices', 'browsers', 'sources', 'daily', 'modes']) {
    check(`overview has ${key}`, key in o, Object.keys(o).join(','));
  }
  check('session counted', (o.funnel?.sessions ?? 0) >= 1, JSON.stringify(o.funnel));
  check('sections recorded', (o.sections?.length ?? 0) >= 3, JSON.stringify(o.sections));
  check('terminal section is the exit', o.sections?.some((s) => s.path === '/#contact' && s.exits >= 1), JSON.stringify(o.sections));
  check('dwell attributed to its own section', o.sections?.some((s) => s.path === '/#work' && s.avgSeconds > 0), JSON.stringify(o.sections));
  check('CTA seen and clicked paired', o.ctas?.some((c) => c.tag === 'contact-email' && c.seenSessions >= 1 && c.clicks >= 1), JSON.stringify(o.ctas));
  check('friction recorded', o.friction?.some((f) => f.kind === 'dead'), JSON.stringify(o.friction));
  check('daily grid is contiguous', (o.daily?.length ?? 0) >= 30, `${o.daily?.length} days`);
  check('timezone named', o.meta?.timezone === 'IST', JSON.stringify(o.meta));
  check('retention horizon reported', o.meta?.retentionDays === 180, JSON.stringify(o.meta));

  const aud = await admin('audience', { range: '30d', excludeInternal: false });
  check('audience 200', aud.status === 200, JSON.stringify(aud.json).slice(0, 200));
  check('utm_source lowercased to one row', aud.json?.sourceMedium?.some((s) => s.source === 'linkedin'), JSON.stringify(aud.json?.sourceMedium));

  const camp = await admin('campaigns', { range: '30d', excludeInternal: false });
  check('campaigns 200', camp.status === 200, JSON.stringify(camp.json).slice(0, 200));
  check('%40 campaign rejected whole', !JSON.stringify(camp.json?.campaigns ?? []).includes('portfolio'), JSON.stringify(camp.json?.campaigns));

  const chat = await admin('chat', { range: '30d', excludeInternal: false });
  check('chat 200', chat.status === 200, JSON.stringify(chat.json).slice(0, 300));
  check('chat asks counted', (chat.json?.asked ?? 0) >= 2, JSON.stringify(chat.json?.asked));
  check('coverage gap measured', (chat.json?.coverageGapPct ?? 0) > 0, JSON.stringify(chat.json?.coverageGapPct));
  check('pii rejection counted', chat.json?.rejections?.some((x) => x.label === 'pii'), JSON.stringify(chat.json?.rejections));
  check('question text retention stated', chat.json?.questionTextRetentionDays === 30, JSON.stringify(chat.json?.questionTextRetentionDays));

  const map = await admin('click-map', { range: '30d', excludeInternal: false, kind: 'click' });
  check('click-map 200', map.status === 200, JSON.stringify(map.json).slice(0, 200));
  check('heatmap has a cell', (map.json?.cells?.length ?? 0) >= 1, JSON.stringify(map.json?.cells));
  check('median doc height is a real observation', map.json?.medianDocH === 12000, JSON.stringify(map.json?.medianDocH));

  const sess = await admin('sessions', { range: '30d', excludeInternal: false, limit: 10 });
  check('sessions 200', sess.status === 200, JSON.stringify(sess.json).slice(0, 200));
  check('no raw IP is ever returned', !JSON.stringify(sess.json ?? []).match(/"ip"\s*:/), 'an ip field leaked');
}

// ── the /admin page gate ────────────────────────────────────────────────────

if (token) {
  // The cookie must reach the PAGE as well as the API. Scoping it to
  // /api/admin meant /admin never saw it and the sign-in form reappeared
  // however many times you signed in. This is that regression's test.
  const exchange = await fetch(`${base}/api/admin/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  check('session exchange 200', exchange.status === 200, `status ${exchange.status}`);

  const setCookie = exchange.headers.get('set-cookie') ?? '';
  check('cookie is HttpOnly', /HttpOnly/i.test(setCookie), setCookie);
  check('cookie is SameSite=Strict', /SameSite=Strict/i.test(setCookie), setCookie);
  check('cookie path reaches the page', /Path=\/(;|$)/i.test(setCookie), setCookie);

  const cookie = setCookie.split(';')[0];
  const page = await fetch(`${base}/admin`, { headers: { cookie } });
  const pageHtml = await page.text();
  check('admin page 200 with cookie', page.status === 200, `status ${page.status}`);
  check('admin shell rendered, not the sign-in form',
    pageHtml.includes('Click heatmap') && !pageHtml.includes('Access token'),
    'sign-in form still showing');

  const bad = await fetch(`${base}/api/admin/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'x'.repeat(40) }),
  });
  check('wrong token -> 404', bad.status === 404, `status ${bad.status}`);
}

// ── the preview freeze, which is what keeps the heatmap honest ──────────────

const preview = await fetch(`${base}/?embed=true&preview=heatmap`);
const html = await preview.text();
check('preview page 200', preview.status === 200, `status ${preview.status}`);

// The freeze is POST-HYDRATION by design, so the server-rendered HTML still
// contains the launcher and this cannot be asserted here.
//
// useHeatmapPreview() returns false from getServerSnapshot deliberately: the
// alternatives are a hydration mismatch (a useState initialiser reading
// window) or making `/` dynamic for every visitor to serve an admin-only
// feature. Inverting the default, rendering the launcher hidden until the
// client confirms it is NOT a preview, would hide it for one frame for
// everyone, which is a real regression traded for a cosmetic one.
//
// It does not affect measurement: `.chat-launcher` is position:fixed so it
// never contributes to scrollHeight, and the heatmap does not measure until
// onLoad at the earliest. Verifying the visual freeze needs a browser; it is
// a manual step in ANALYTICS.md, not a case here.
check('preview page still renders the app shell', html.includes('portfolio'), 'shell missing');

const normal = await fetch(`${base}/`);
const normalHtml = await normal.text();
check('normal page keeps the chat launcher', normalHtml.includes('chat-launcher'), 'chat-launcher missing from normal HTML');

// ── report ──────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`\n${failures.length} failed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`Passed ${passed} analytics checks.`);
