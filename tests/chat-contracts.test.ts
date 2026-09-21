/**
 * Three couplings that are invisible at the call site and break silently.
 *
 * Each of these was a real defect found by testing the deployed site, and
 * each would come back the same way: nothing throws, nothing fails to
 * compile, and the only symptom is a visitor getting a worse answer.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { answers, answerQuestion } from '@/content/faq';
import { speechFailureHint } from '@/lib/chat/speech-text';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the model budget stays inside the browser timeout', () => {
  // The defect: composeAnswer budgeted its retry against TIMEOUT_MS, so a
  // first attempt failing at 5.9s started a second with a fresh 6.5s.
  // Measured in production at 9.7s, 9.9s and 12.3s, all after Chat.tsx had
  // aborted at 8.5s and served the offline answer. The model call was paid
  // for and discarded every time.
  const nim = read('lib/chat/nim.ts');
  const chat = read('components/portfolio/Chat.tsx');
  const budget = Number(/const TOTAL_BUDGET_MS = (\d+)/.exec(nim)?.[1]);
  // Since the reply streams, the browser's deadline is on the FIRST token
  // rather than on the whole answer: once words are on screen there is
  // nothing to gain by cutting them off. The non-streaming path still has
  // to finish inside that same deadline, because it produces nothing until
  // it produces everything.
  const clientTimeout = Number(/firstTokenMs:(\d+)/.exec(chat)?.[1]);
  assert.ok(budget > 0, 'TOTAL_BUDGET_MS not found in lib/chat/nim.ts');
  assert.ok(clientTimeout > 0, 'firstTokenMs was not found in Chat.tsx');
  assert.ok(
    budget + 500 <= clientTimeout,
    `the Worker may spend ${budget}ms while the browser gives up at ${clientTimeout}ms`,
  );
  // And the streaming ceiling must be the looser one, or streaming buys
  // nothing: the whole point is that a 10.9s answer is readable from 1s.
  const streamTotal = Number(/export const STREAM_TOTAL_MS = (\d+)/.exec(nim)?.[1]);
  assert.ok(streamTotal > clientTimeout, 'the stream ceiling must outlast the first-token deadline');
  // And the retry must draw from that budget rather than from the per-call
  // ceiling, which is the specific line that was wrong.
  assert.match(nim, /TOTAL_BUDGET_MS - \(Date\.now\(\) - started\)/);
});

test('every documented per-technology duration survives the scoped-duration guard', () => {
  // guard.unknown refuses "how many years of <technology>" because the
  // portfolio records total experience, not years per tool. Any answer that
  // DOES document one has to be allow-listed, or the guard swallows it
  // before the pattern ever runs. `python-years` was caught exactly this way.
  const documented = answers.filter((entry) => entry.id?.endsWith('-years'));
  assert.ok(documented.length > 0, 'expected at least one <tech>-years answer');
  for (const entry of documented) {
    const technology = entry.id!.replace(/-years$/, '');
    if (technology === 'tenure') continue;
    const result = answerQuestion(`how many years of ${technology}?`);
    assert.equal(
      result.source,
      'From the portfolio',
      `"${technology}" has a documented duration but the guard refuses it; add it to DOCUMENTED_SPAN in content/faq.ts`,
    );
  }
});

test('the scoped-duration guard still refuses a technology with no answer', () => {
  for (const technology of ['Go', 'Rust', 'Kotlin', 'React']) {
    const result = answerQuestion(`how many years of ${technology}?`);
    assert.equal(result.source, 'Not documented', `${technology} should not have a duration`);
    // And it must not reach the model: a refusal is not a miss.
    assert.notEqual(result.unmatched, true);
  }
});

test('the speech failure hint never tells a Safari visitor to use Safari', () => {
  const safari =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const chrome =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
  const edge = `${chrome} Edg/153.0.0.0`;
  assert.ok(!speechFailureHint(safari).includes('works in Safari'));
  // Every Chromium browser carries "Safari" in its UA, which is the trap.
  assert.ok(speechFailureHint(chrome).includes('works in Safari'));
  assert.ok(speechFailureHint(edge).includes('works in Safari'));
  assert.ok(speechFailureHint('').includes('works in Safari'), 'an unknown UA gets the suggestion');
  for (const ua of [safari, chrome, edge, '']) {
    assert.ok(speechFailureHint(ua).startsWith('Your browser accepted the audio'));
  }
});

test('the chat log has exactly one live region', () => {
  // role="log" is implicitly aria-live="polite", and <output> is implicitly
  // its own live region. Nesting them made screen readers announce every
  // status line twice.
  const chat = read('components/portfolio/Chat.tsx');
  assert.ok(!/role="log" aria-live=/.test(chat), 'role="log" already implies aria-live');
  const outputs = chat.match(/<output/g) ?? [];
  const silenced = chat.match(/<output aria-live="off"/g) ?? [];
  assert.equal(silenced.length, outputs.length, 'every <output> inside the log must be aria-live="off"');
});

test('the input keeps focus while a question is in flight', () => {
  // `disabled` moves focus to <body> for up to 8.5s, which loses a keyboard
  // visitor their place and leaves a screen reader nothing to return to.
  const chat = read('components/portfolio/Chat.tsx');
  assert.match(chat, /readOnly=\{busy\}/);
  assert.ok(!/id="chat-input"[^/]*disabled=\{busy\}/.test(chat), 'the input must not be disabled while busy');
});

test('the question limit is one number, shared by client and server', () => {
  // maxLength used to truncate a paste silently: 800 characters became 500
  // and the visitor was never told which 300 were dropped. The input now
  // validates instead, which only works if both ends agree on the number.
  const chat = read('components/portfolio/Chat.tsx');
  const route = read('app/api/chat/route.ts');
  const clientMax = Number(/const MAX_QUESTION=(\d+)/.exec(chat)?.[1]);
  assert.ok(clientMax > 0, 'MAX_QUESTION not found in Chat.tsx');
  assert.ok(
    route.includes(`body.message.length>${clientMax}`),
    `the route rejects at a different length than the panel's ${clientMax}`,
  );
  assert.ok(!/id="chat-input"[^/]*maxLength=/.test(chat), 'the input must validate, not truncate');
  assert.match(chat, /aria-invalid=\{tooLong/);
  assert.match(chat, /role="alert"/);
});
