/**
 * backend/knowledge.json is content/*.ts, as data, and nothing else.
 *
 * Python serves every reply from that file: the answer set, and since the fixed refusals moved
 * into GUARD_REPLIES, GREETING and FALLBACK, those too. So "the two runtimes agree" reduces to "the
 * file is what scripts/sync-knowledge.mjs would write now", plus the two clock ports agreeing,
 * which tests/clock-cases.json covers from both sides. A failure here means: run
 * `node scripts/sync-knowledge.mjs`.
 */
// oxlint-disable typescript/no-floating-promises -- node:test collects and awaits test() itself.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BIRTH_MONTH, CAREER_START, PYTHON_START, age, tenure } from '@/content/portfolio';
import { FALLBACK, GREETING, GUARD_REPLIES, answers, guard } from '@/content/faq';

type Entry = { id: string; answer: string };
const knowledge = JSON.parse(readFileSync(new URL('../backend/knowledge.json', import.meta.url), 'utf8')) as { answers: Entry[]; guard: unknown; replies: unknown };

/** What backend/main.py render_clock() does, on today's date, from the TypeScript functions. */
const render = (text: string) => text.replace(/\{\{(tenure|age):([0-9-]+)\}\}/g, (_, kind: string, value: string) => {
  if (kind === 'tenure') return tenure(value);
  assert.equal(value, BIRTH_MONTH);
  return String(age());
});

test('every guard has exactly one fixed reply', () => {
  // GUARD_REPLIES is the loop, and its order is the evaluation order (sensitive before abuse), which
  // tests/faq.test.ts pins. A guard missing from it would compile and never run.
  assert.deepEqual(GUARD_REPLIES.map((reply) => reply.guard).sort(), Object.keys(guard).sort());
});

test('knowledge.json carries the fixed replies and the guards as they are now', () => {
  assert.deepEqual(knowledge.replies, JSON.parse(JSON.stringify({ guards: GUARD_REPLIES, greeting: GREETING, fallback: FALLBACK })));
  assert.deepEqual(knowledge.guard, guard);
});

test('knowledge.json answers, rendered today, are the answers the Worker serves today', () => {
  // Read through JSON so the clock getters run, exactly as the sync reads them.
  const live = JSON.parse(JSON.stringify(answers)) as Entry[];
  assert.equal(knowledge.answers.length, live.length);
  knowledge.answers.forEach((entry, at) => assert.deepEqual({ ...entry, answer: render(entry.answer) }, live[at], entry.id));
});

test('knowledge.json holds no date-dependent text, only placeholders', () => {
  // The literal figures the monthly diff used to change. A closed range such as "2 years 4 months"
  // (Meridian) is fixed and stays written out; the open-ended ones must not be.
  const text = JSON.stringify(knowledge.answers);
  for (const value of [tenure(CAREER_START), tenure(PYTHON_START)]) assert.ok(!text.includes(`${value} of`), `knowledge.json quotes "${value}"`);
  assert.ok(!text.includes(`Alex is ${age()}.`), 'knowledge.json quotes the age');
});
