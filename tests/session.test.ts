/**
 * The chat session: when it ends, and what survives when it does.
 *
 * Two of these guard bugs that were shipped rather than imagined. The
 * transcript used to be keyed by array index while never being trimmed, and
 * the Listen button identified the reply it was speaking by that same index.
 * Both are only wrong once the list can lose its head, which is exactly what
 * `trimTranscript` introduces — so the cap and the keys are tested together.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDLE_MS, MAX_TRANSCRIPT, hasLapsed, nextKey, resetKeys, trimTranscript } from '@/lib/chat/session';

test('ten minutes is the limit, and the boundary is inclusive', () => {
  assert.equal(IDLE_MS, 600_000);
  const at = 1_700_000_000_000;
  assert.equal(hasLapsed(at, at + IDLE_MS - 1), false);
  assert.equal(hasLapsed(at, at + IDLE_MS), true);
  assert.equal(hasLapsed(at, at + IDLE_MS * 40), true);
});

test('a session that never started has not lapsed', () => {
  // lastActivityAt is 0 before the panel is ever opened. Treating that as a
  // lapse would put the timed-out divider above the visitor's first question.
  assert.equal(hasLapsed(0, Date.now()), false);
});

test('a clock that moved backwards does not end a conversation', () => {
  const at = 1_700_000_000_000;
  assert.equal(hasLapsed(at, at - 5_000), false);
});

test('a short transcript is returned untouched, as a copy', () => {
  const messages = [{ k: 0 }, { k: 1 }, { k: 2 }];
  const trimmed = trimTranscript(messages);
  assert.deepEqual(trimmed, messages);
  assert.notEqual(trimmed, messages, 'a fresh array, so setState sees a change');
});

test('the greeting survives the cap, and the oldest turns do not', () => {
  const messages = Array.from({ length: MAX_TRANSCRIPT + 12 }, (_, i) => ({ k: i }));
  const trimmed = trimTranscript(messages);
  assert.equal(trimmed.length, MAX_TRANSCRIPT);
  // The first message is the only one that says what the panel answers from.
  assert.deepEqual(trimmed[0], { k: 0 });
  assert.deepEqual(trimmed[1], { k: 13 }, 'the second slot is the oldest kept turn');
  assert.deepEqual(trimmed.at(-1), { k: MAX_TRANSCRIPT + 11 }, 'the newest is never dropped');
});

test('trimming exactly at the cap keeps everything', () => {
  const messages = Array.from({ length: MAX_TRANSCRIPT }, (_, i) => ({ k: i }));
  assert.equal(trimTranscript(messages).length, MAX_TRANSCRIPT);
});

test('a cap of one leaves the greeting alone', () => {
  assert.deepEqual(trimTranscript([{ k: 0 }, { k: 1 }, { k: 2 }], 1), [{ k: 0 }]);
});

test('keys are never reused, including across a trim', () => {
  resetKeys();
  const keys = Array.from({ length: 200 }, () => nextKey());
  assert.equal(new Set(keys).size, 200, 'every key is distinct');
  assert.equal(keys[0], 1, 'zero is reserved for the greeting, which is never re-keyed');
  const trimmed = trimTranscript(keys.map((k) => ({ k })), 10);
  assert.equal(new Set(trimmed.map((m) => m.k)).size, 10);
});
