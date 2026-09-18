/**
 * Guards for the awards section.
 *
 * The section is unusual in this repo: its data is committed but deliberately
 * unfinished, because the dates and citations are facts only Alex has and an
 * award is the kind of claim a résumé must get exactly right. These tests
 * encode "unfinished is fine, unfinished-and-published is not".
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting;
// the runner collects and awaits them itself.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AWARD_TBC, awards, publishedAwards } from '@/content/portfolio';
import { answers } from '@/content/faq';
import { SECTIONS, SECTION_IDS } from '@/lib/analytics/section-catalogue';

test('every award carries the fields the card needs', () => {
  for (const a of awards) {
    assert.ok(a.id && a.name && a.issuer && a.category, `${a.id}: missing a field`);
    assert.ok(a.aliases.length > 0, `${a.id}: no chatbot aliases`);
  }
  const ids = awards.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'award ids must be unique');
});

test('an award is published only once both facts are confirmed', () => {
  // `publishedAwards` is the single gate. If this ever diverges from the
  // sentinel check, an unconfirmed award reaches the page and the chatbot.
  for (const a of publishedAwards) {
    assert.notEqual(a.issued, AWARD_TBC, `${a.id}: published with an unconfirmed date`);
    assert.notEqual(a.citation, AWARD_TBC, `${a.id}: published with an unconfirmed citation`);
  }
  assert.equal(
    publishedAwards.length,
    awards.filter((a) => a.issued !== AWARD_TBC && a.citation !== AWARD_TBC).length,
  );
});

test('no sentinel text can reach a rendered surface', () => {
  // The sentinel is loud on purpose, so the failure mode worth testing is it
  // being rendered rather than it existing. Both the section and the chatbot
  // read `publishedAwards`, so neither can print one.
  const published = JSON.stringify(publishedAwards);
  assert.ok(!published.includes(AWARD_TBC));
  const awardAnswers = answers.filter((a) => a.id.startsWith('award-'));
  assert.equal(awardAnswers.length, publishedAwards.length);
  assert.ok(!JSON.stringify(awardAnswers).includes(AWARD_TBC));
});

test('the chatbot answers "what awards" either way', () => {
  // Before the facts land the aggregate still answers, without dates. A
  // portfolio chatbot that says nothing to a direct question reads as though
  // there is nothing to say.
  const agg = answers.find((a) => a.id === 'awards');
  assert.ok(agg, 'the aggregate awards answer must exist');
  assert.ok(agg.patterns.includes('employee of the month'));
  assert.ok(!agg.answer.includes(AWARD_TBC));
  assert.ok(agg.answer.length > 60);
});

test('#awards is registered for analytics exactly when it renders', () => {
  // A section id in SECTIONS that is absent from the DOM shows in the section
  // funnel as a permanent zero, which reads as "nobody scrolled this far"
  // rather than "this does not exist", the trap ANALYTICS.md records for
  // #additional-projects. So registration has to track rendering, both ways.
  const registered = SECTIONS.some((s) => s.id === 'awards');
  if (publishedAwards.length > 0) {
    assert.ok(registered, 'awards render: add #awards to SECTIONS, in document order after #dashboards');
    assert.ok(SECTION_IDS.has('awards'), 'add #awards to the ingest allowlist');
  } else {
    assert.ok(!registered, 'awards do not render yet: #awards must stay out of SECTIONS or it is a permanent zero in the funnel');
  }
});

test('the section and the nav entry are both gated on publishedAwards', () => {
  const src = readFileSync(
    new URL('../components/portfolio/Portfolio.tsx', import.meta.url),
    'utf8',
  );
  assert.match(src, /publishedAwards\.length>0&&<section id="awards"/);
  assert.match(src, /publishedAwards\.length\?\[\['awards','Awards'\] as const\]:\[\]/);
});
