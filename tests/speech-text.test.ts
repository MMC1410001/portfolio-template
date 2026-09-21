/**
 * Reading an answer aloud, and the three things that ruin it.
 *
 * These are cheap tests for an expensive-to-notice failure: nobody reads a
 * spoken answer in a diff, so a regression here is only found by a visitor
 * listening to a synthesiser spell out an email address one letter at a time.
 *
 * The fixtures are real strings from content/faq.ts rather than invented
 * ones, because the whole risk is in what those answers actually contain.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answers } from '@/content/faq';
import { chunkForSpeech, pickVoice, speakable } from '@/lib/chat/speech-text';

test('an email address is pointed at, never recited', () => {
  const spoken = speakable('You can reach Alex at alex@example.com, or connect on LinkedIn.');
  assert.ok(!spoken.includes('@'), 'no address survives');
  assert.ok(spoken.includes('his email address, shown on screen'));
});

test('a phone number is pointed at too', () => {
  const spoken = speakable('Reach him at +1 555 0142 today.');
  assert.ok(!/\d{5}/.test(spoken), `a number survived: ${spoken}`);
  assert.ok(spoken.includes('his phone number, shown on screen'));
});

test('figures that merely look like phone numbers are left alone', () => {
  for (const keep of [
    'Two companies in 3 years 10 months of professional engineering.',
    'He reached 90% automation coverage and cut regression time by 50%.',
    'A BE in Civil Engineering (2021) and a Diploma in 2018.',
    'Under 2s turn latency across four languages.',
  ]) {
    assert.equal(speakable(keep), keep, 'a real figure was mistaken for contact details');
  }
});

test('a URL becomes a pointer rather than spelled-out punctuation', () => {
  const spoken = speakable('Lumen is public at lumen.example and the repo is at https://github.com/x/y.');
  assert.ok(!spoken.includes('http'), spoken);
  assert.ok(!spoken.includes('lumen.example'), spoken);
});

test('the visual separator becomes a pause the voice can hear', () => {
  const spoken = speakable('Open to opportunities · 60-day notice, buyout available');
  assert.ok(!spoken.includes('·'));
  assert.ok(spoken.startsWith('Open to opportunities. 60-day notice'), spoken);
});

test('a non-breaking hyphen from the model is normalised', () => {
  assert.equal(speakable('under‑2‑second turn latency'), 'under-2-second turn latency');
});

test('empty in, empty out, and no bare punctuation is ever spoken', () => {
  assert.equal(speakable(''), '');
  assert.equal(speakable('https://example.com/only'), 'the link shown on screen');
  assert.ok(!/^[\s.·]+$/.test(speakable('· · ·')), 'punctuation alone must not be spoken');
});

test('a very long answer is clipped at a sentence, not mid-word', () => {
  const long = `${'This is a sentence about his work. '.repeat(80)}`;
  const spoken = speakable(long);
  assert.ok(spoken.length <= 1400, `got ${spoken.length}`);
  assert.ok(spoken.endsWith('.'), `clipped mid-sentence: ${spoken.slice(-40)}`);
});

test('every approved answer survives being spoken', () => {
  for (const entry of answers) {
    const spoken = speakable(entry.answer);
    assert.ok(spoken.length > 0, `answer "${entry.id}" became unspeakable`);
    assert.ok(!spoken.includes('@'), `answer "${entry.id}" would spell out an address`);
    assert.ok(!spoken.includes('http'), `answer "${entry.id}" would read a URL aloud`);
    assert.ok(!spoken.includes('·'), `answer "${entry.id}" keeps a visual separator`);
  }
});

test('the voice is Indian English when the browser has one', () => {
  const voices = [
    { lang: 'en-US', localService: true },
    { lang: 'en-GB', localService: true },
    { lang: 'en-IN', localService: true },
  ];
  assert.equal(pickVoice(voices)?.lang, 'en-IN');
  assert.equal(pickVoice(voices.filter((v) => v.lang !== 'en-IN'))?.lang, 'en-GB');
  assert.equal(pickVoice([{ lang: 'en-AU', localService: true }])?.lang, 'en-AU');
});

test('a local voice wins within its tier, because nothing then leaves the device', () => {
  const picked = pickVoice([
    { lang: 'en-IN', localService: false },
    { lang: 'en-IN', localService: true },
  ]);
  assert.equal(picked?.localService, true);
});

test('no English voice, or none at all, means let the browser decide', () => {
  assert.equal(pickVoice([]), null);
  assert.equal(pickVoice([{ lang: 'hi-IN', localService: true }]), null);
});

test('a long answer is queued as short utterances, not one that Chrome will cut off', () => {
  // The longest answer there is, rather than a named one. Naming `impact`
  // tied this test to one piece of content: editing or removing that answer
  // failed a test about chunking, which is not what it checks. Found by
  // porting to the public template, where that answer does not belong.
  const answer = answers.reduce((longest, entry) => (entry.answer.length > longest.answer.length ? entry : longest));
  assert.ok(answer.answer.length > 400, `no answer long enough to exercise chunking: ${answer.answer.length}`);
  const chunks = chunkForSpeech(speakable(answer.answer));
  assert.ok(chunks.length > 1, 'a long answer must be split');
  for (const chunk of chunks) assert.ok(chunk.length <= 170, `chunk too long: ${chunk.length}`);
  // Nothing may be dropped: the spoken words must still be the written ones.
  const rejoined = chunks.join(' ').replace(/\s+/g, ' ');
  const original = speakable(answer.answer).replace(/\s+/g, ' ');
  assert.equal(rejoined, original, 'chunking lost or duplicated text');
});

test('a short answer stays a single utterance', () => {
  assert.deepEqual(chunkForSpeech('He is on a 60-day notice.'), ['He is on a 60-day notice.']);
});

test('a sentence longer than a chunk is broken without losing words', () => {
  const runOn = `He works with ${Array.from({ length: 40 }, (_, i) => `tool${i}`).join(', ')}.`;
  const chunks = chunkForSpeech(runOn);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.ok(chunk.length <= 170, `chunk too long: ${chunk.length}`);
  assert.equal(chunks.join(' '), runOn);
});

test('nothing in, nothing queued', () => {
  assert.deepEqual(chunkForSpeech(''), []);
  assert.deepEqual(chunkForSpeech('   '), []);
});

test('every approved answer chunks cleanly', () => {
  for (const entry of answers) {
    const chunks = chunkForSpeech(speakable(entry.answer));
    assert.ok(chunks.length > 0, `answer "${entry.id}" produced no utterance`);
    for (const chunk of chunks) {
      assert.ok(chunk.length <= 170, `answer "${entry.id}" has a ${chunk.length}-char chunk`);
    }
  }
});

test('a phone number in any country grouping is pointed at, not recited', () => {
  // Found by porting this file to the public template, whose sample number
  // is "+1 555 0142". The pattern only knew the five-and-five Indian
  // grouping, so a fork would have had its owner's number spelled out digit
  // by digit. Every shape here must be caught, and none of the durations.
  for (const number of ['+1 555 0142', '+1 555 0142', '+44 20 7946 0958', '+61-2-9374-4000']) {
    const spoken = speakable(`Reach him at ${number} today.`);
    assert.ok(spoken.includes('his phone number, shown on screen'), `missed: ${number}`);
    assert.ok(!/\d{4}/.test(spoken), `digits survived: ${spoken}`);
  }
  for (const safe of ['2 years 4 months of work', 'Between 2022 and 2025', 'From November 2022 to March 2025', 'cut regression time by 50%']) {
    assert.equal(speakable(safe), safe, `a duration was swallowed: ${safe}`);
  }
});
