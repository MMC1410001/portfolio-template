/**
 * The TypeScript half of the shared answer contract, with no server.
 *
 * tests/chat-cases.json is replayed three ways: tests/chat.mjs over HTTP (needs `npm run dev`, so CI
 * never runs it), test_answer_contract through Python's faq(), and this file through the same two
 * calls app/api/chat/route.ts makes before any network tier: `answerQuestion()`, then
 * `withFitFallback()`. That is the reply the route serves with no backend and no NIM_API_KEY.
 *
 * The comparison is chat.mjs's, exactly: the answer contains `expected`, case-insensitively. Its one
 * exception, a fit question the model composed (`mode === 'ai'`), cannot happen here: nothing in this
 * path calls a model, so those cases are held to the curated "Four reasons" text like any other.
 * Nothing is skipped. Rate limits, input validation and the model tier are route behaviour, and
 * tests/routes.test.ts and tests/chat-route.test.ts cover them.
 */
// oxlint-disable typescript/no-floating-promises -- node:test collects and awaits test() itself.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { answerQuestion } from '@/content/faq';
import { withFitFallback } from '@/lib/chat/fit';

const cases = JSON.parse(readFileSync(new URL('./chat-cases.json', import.meta.url), 'utf8')) as [string, string][];

test('chat-cases.json is a non-empty list of [question, expected] pairs', () => {
  assert.ok(cases.length > 0);
  for (const pair of cases) assert.ok(Array.isArray(pair) && pair.length === 2 && pair.every((part) => typeof part === 'string' && part.length > 0), JSON.stringify(pair));
});

for (const [question, expected] of cases) {
  test(`answers ${JSON.stringify(question)}`, () => {
    const reply = withFitFallback(question, answerQuestion(question));
    assert.ok(reply.answer.trim().length > 0, 'empty answer');
    assert.ok(reply.answer.toLowerCase().includes(expected.toLowerCase()), `expected ${JSON.stringify(expected)} in ${JSON.stringify(reply)}`);
  });
}
