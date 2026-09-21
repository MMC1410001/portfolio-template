/**
 * Guards for the `/dashboards` showcase.
 *
 * These are content tests, not rendering tests. `npm run test:units` runs on a
 * bare Node process through `tests/ts-hooks.mjs`, which is why nothing here
 * imports a component: `content/dashboards.ts` and `content/dashboards-demo.ts`
 * are pure data and import cleanly, while every recreation is a React client
 * component that would not. The one structural check that does need the
 * component reads it as text.
 *
 * What is being defended is the sanitisation boundary. Every failure mode this
 * file catches ships successfully and looks fine, a leaked Apps Script
 * deployment id renders as a plausible string, and a real colleague's name
 * renders as a plausible name. Nothing downstream notices.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting;
// the runner collects and awaits them itself.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dashboards } from '@/content/dashboards';
import { MAX_TAG_LEN } from '@/lib/analytics/events';
import { normaliseTag } from '@/lib/analytics/normalise';
import { SECTIONS, SECTION_IDS } from '@/lib/analytics/section-catalogue';
import * as demo from '@/content/dashboards-demo';

const read = (rel: string) =>
  readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const detail = read('components/dashboards/DashboardDetail.tsx');
const route = read('app/dashboards/[slug]/page.tsx');
/** Every file that renders a `data-track-tag` naming a dashboard. */
const TAGGED_FILES = [
  'components/dashboards/DashboardDetail.tsx',
  'components/dashboards/DashboardIndex.tsx',
  'components/portfolio/Portfolio.tsx',
] as const;

/** Everything the data modules hold, as one string, for substring checks. */
const corpus = JSON.stringify([
  dashboards,
  Object.entries(demo).filter(([, v]) => typeof v !== 'function'),
]);

test('every dashboard has a recreation wired up', () => {
  const map = detail.slice(
    detail.indexOf('const RECREATIONS'),
    detail.indexOf('export function DashboardDetail'),
  );
  const missing = dashboards.filter((d) => !map.includes(`'${d.id}'`));
  assert.deepEqual(
    missing.map((d) => d.id),
    [],
    'dashboards listed in content/dashboards.ts with no component in RECREATIONS render a blank "in progress" panel in production',
  );
});

test('the detail route is statically enumerated from the content module', () => {
  // A hand-written slug list would go stale the next time an entry is added,
  // and the symptom is a 404 on a card that looks perfectly fine on the
  // homepage. `dynamicParams = false` is what turns a missing slug into a
  // build-time absence rather than an on-demand render of a static site.
  assert.match(route, /generateStaticParams/);
  assert.match(route, /dashboards\.map\(\(d\) => \({ slug: d\.id }\)\)/);
  assert.match(route, /export const dynamicParams = false/);
});

test('dashboard ids are unique', () => {
  const ids = dashboards.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every dashboard states why it exists', () => {
  for (const d of dashboards) {
    assert.ok(d.purpose.length > 80, `${d.id}: purpose is too thin to be a reason`);
    assert.ok(d.shows.length > 40, `${d.id}: shows is empty`);
    assert.ok(d.stack.length > 0, `${d.id}: no stack`);
    assert.ok(d.short.length > 0 && d.short.length <= 24, `${d.id}: short label`);
    assert.ok(d.tagline.length > 20, `${d.id}: tagline is too thin for a card`);
    assert.ok(d.tagline.length <= 80, `${d.id}: tagline will wrap past two lines on a card`);
    assert.ok(d.metric.length > 0, `${d.id}: no metric for the card`);
  }
});

test('every dashboard tracking tag survives normalisation', () => {
  // normaliseTag() returns null past MAX_TAG_LEN, so an over-long tag is not
  // truncated, the click is dropped on ingest with no error at either end.
  // These tags interpolate a dashboard id, so the longest id decides whether
  // a whole card's clicks are counted.
  const prefixes = ['dashboard-card-', 'dashboard-index-', 'dashboard-prev-', 'dashboard-next-'];
  for (const d of dashboards)
    for (const prefix of prefixes) {
      const tag = `${prefix}${d.id}`;
      assert.equal(normaliseTag(tag), tag, `${tag} does not survive normaliseTag`);
      assert.ok(
        tag.length <= MAX_TAG_LEN,
        `${tag} is ${tag.length} chars, over MAX_TAG_LEN (${MAX_TAG_LEN}), the click would be dropped silently`,
      );
    }
});

test('the homepage links every dashboard, and links it by id', () => {
  // The point of the cards is discovery: a dashboard that exists but is not
  // reachable from the homepage is the state this section was built to end.
  assert.match(
    read('components/portfolio/Portfolio.tsx'),
    /href=\{`\/dashboards\/\$\{d\.id\}`\}/,
    'Portfolio.tsx must link each card to /dashboards/<id>',
  );
  for (const file of TAGGED_FILES) {
    const src = read(file);
    assert.ok(
      src.includes('/dashboards/') || src.includes('dashboard-'),
      `${file} no longer references the dashboards route`,
    );
  }
});

test('the dashboards section is registered for analytics', () => {
  // A section in the DOM that is not in SECTION_IDS has its dwell rows
  // discarded by the ingest route, which looks exactly like nobody scrolling
  // to it. Document order matters too: the section funnel reads this list.
  const ids = SECTIONS.map((s) => s.id);
  assert.ok(ids.includes('dashboards'), 'add #dashboards to SECTIONS');
  assert.ok(SECTION_IDS.has('dashboards'), 'add #dashboards to the ingest allowlist');
  assert.ok(
    ids.indexOf('dashboards') === ids.indexOf('work') + 2,
    'SECTIONS must stay in document order; #dashboards sits after #work and its nested #northwind-erp block',
  );
});

test('no internal URL reaches the published content', () => {
  // Apps Script deployment ids, sheet ids and the Workspace domain are the
  // three things the source workbook carries and this showcase must not.
  for (const needle of [
    'script.google.com',
    'docs.google.com',
    'northwind.example',
    'AKfycb',
    '/macros/',
    'http://',
    'https://',
  ]) {
    assert.ok(
      !corpus.includes(needle),
      `"${needle}" appears in the dashboards content. See the header of content/dashboards.ts`,
    );
  }
});

test('no real client is named', () => {
  // ── Put your own clients' names in this list before you publish ─────────
  //
  // The dashboards in content/dashboards-demo.ts are recreations: the shape
  // of the work is real, the names and the numbers are not. This test is what
  // stops a client's name reaching a public page through a label, a tooltip
  // or a series title somebody forgot to change — the kind of thing that
  // ships green, because nothing about it looks like a bug.
  //
  // It is seeded with the invented brands this template ships with, so it is
  // armed from the first clone rather than being a reminder you have to
  // remember to act on. Add your real ones; there is no reason to remove
  // these.
  for (const needle of [
    'Halcyon',
    'Tixly',
    'Lumen',
    'Apex',
    'Meridian',
    'Northwind',
    'Taxwise',
    'Brookfield',
    'Riverside',
  ]) {
    assert.ok(
      !corpus.includes(needle),
      `"${needle}" appears in the dashboards content, clients are positional labels here`,
    );
  }
});

test('no real person is named, including the author', () => {
  for (const needle of ['Alex', 'Rivera', 'alex.rivera', '@northwind']) {
    assert.ok(
      !corpus.includes(needle),
      `"${needle}" appears in the synthetic data, every person on these recreations is invented`,
    );
  }
});

test('clients are positional labels, and reused consistently', () => {
  const named = dashboards.filter((d) => d.client !== null);
  for (const d of named)
    assert.match(
      d.client as string,
      /^Enterprise client [A-Z]$/,
      `${d.id}: client must be a positional label`,
    );
  // The quality scorecard and the effort report are the same client, and the
  // page says so. If that pairing is ever broken the claim in the header of
  // content/dashboards.ts stops being true.
  const scorecard = dashboards.find((d) => d.id === 'quality-scorecard');
  const effort = dashboards.find((d) => d.id === 'effort-approval');
  assert.equal(scorecard?.client, effort?.client);
});

test('demo rows are internally consistent', () => {
  for (const p of demo.effortProjects)
    assert.equal(
      p.approved + p.rejected + p.pending,
      p.total,
      `${p.name}: approved + rejected + pending must equal total, or the stacked bar contradicts the table beside it`,
    );

  for (const r of demo.effortResources)
    assert.equal(
      r.byMonth.length,
      demo.effortMonths.length,
      `${r.name}: the resource grid has one cell per month`,
    );

  for (const e of demo.qualityEngagements) {
    const t = e.tests;
    assert.equal(
      t.passed + t.failed + t.blocked + t.notRun,
      t.total,
      `${e.id}: test outcomes must sum to the total`,
    );
  }

  for (const p of demo.scorecardProducts)
    assert.ok(
      p.defects.closed <= p.defects.total,
      `${p.id}: more defects closed than raised`,
    );

  for (const l of demo.learners) {
    assert.ok(l.sessions.attended <= l.sessions.total, `${l.person.name}: attendance`);
    assert.ok(l.assignments.done <= l.assignments.total, `${l.person.name}: assignments`);
  }

  for (const r of demo.okrRows)
    assert.ok(
      r.achieved <= r.set,
      `${r.name}: achieved more OKRs than were set`,
    );
});
