/**
 * Turning URLs inside an approved answer into links you can click.
 *
 * The risk this file exists for is that the alternative was
 * dangerouslySetInnerHTML, which would take prose — some of it written by
 * the model tier — and hand it to the HTML parser. Segments keep React
 * escaping the text and let only a matched URL become an href, so the tests
 * that matter are the ones that try to get something else into that href.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkLabel, linkSegments } from '@/lib/chat/linkify';
import { speakable } from '@/lib/chat/speech-text';
import { answers } from '@/content/faq';

test('prose with no link is one segment', () => {
  const parts = linkSegments('Alex works with React and Python.');
  assert.equal(parts.length, 1);
  assert.equal(parts[0].href, undefined);
});

test('a link is separated out, and the prose around it is kept', () => {
  const parts = linkSegments('See https://github.com/example-dev for the code.');
  assert.deepEqual(parts.map((p) => p.href ?? null), [null, 'https://github.com/example-dev', null]);
  assert.equal(parts.map((p) => p.text).join(''), 'See https://github.com/example-dev for the code.');
});

test('a full stop after a link is text, not part of the href', () => {
  const parts = linkSegments('Open https://taxwise.example.');
  assert.equal(parts[1].href, 'https://taxwise.example');
  assert.equal(parts[2].text, '.');
});

test('only http and https ever become an href', () => {
  for (const hostile of [
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'file:///etc/passwd',
    'vbscript:msgbox(1)',
    '<script>alert(1)</script>',
    'JAVASCRIPT:alert(1) and https://real.example/ok',
  ]) {
    for (const part of linkSegments(hostile)) {
      if (part.href) assert.match(part.href, /^https?:\/\//, `escaped: ${part.href}`);
    }
  }
  // ...and the one real link in that last string still works.
  const mixed = linkSegments('JAVASCRIPT:alert(1) and https://real.example/ok');
  assert.equal(mixed.filter((p) => p.href).length, 1);
});

test('every link in the answer set is extracted whole', () => {
  // The certifications answer carries ten Sample Academy credential URLs. A regex
  // that swallowed one character too many would send a visitor to a 404
  // while looking entirely correct in the transcript.
  const certs = answers.find((a) => a.id === 'certifications');
  assert.ok(certs, 'the certifications answer exists');
  const links = linkSegments(certs.answer).filter((p) => p.href);
  assert.ok(links.length >= 8, `expected credential links, found ${links.length}`);
  for (const link of links) assert.doesNotThrow(() => new URL(link.href!));
});

test('the projects answer carries a repository link per project', () => {
  const projectsAnswer = answers.find((a) => a.id === 'projects');
  assert.ok(projectsAnswer);
  const links = linkSegments(projectsAnswer.answer).filter((p) => p.href);
  assert.ok(links.length >= 4, `expected repo links, found ${links.length}`);
  for (const link of links) assert.match(link.href!, /github\.com\//);
});

test('an opaque identifier is not shown as the label', () => {
  assert.equal(
    linkLabel('https://www.sampleacademy.example/certificate/UC-1d114a41-38f8-4ca9-b1f8-54ea24a0b301/'),
    'sampleacademy.example',
  );
  assert.equal(linkLabel('https://github.com/example-dev/mcp-rag-server'), 'github.com/mcp-rag-server');
  assert.equal(linkLabel('https://taxwise.example'), 'taxwise.example');
  assert.equal(linkLabel('not a url'), 'not a url');
});

test('ten links are not read aloud ten times', () => {
  const certs = answers.find((a) => a.id === 'certifications');
  const spoken = speakable(certs!.answer);
  assert.ok(!spoken.includes('http'), 'no URL survives into speech');
  const pointers = spoken.match(/shown on screen/g)?.length ?? 0;
  assert.equal(pointers, 0, 'past two links they are mentioned once, not pointed at each time');
  assert.ok(spoken.includes('Every link is on screen'));
});

test('a single link is still pointed at individually', () => {
  const spoken = speakable('His GitHub is https://github.com/example-dev and it has the code.');
  assert.ok(spoken.includes('the link shown on screen'));
});
