/**
 * Does the model tier actually work, and does it answer in time?
 *
 * This exists because every defect in the NIM tier had to be found in
 * production. `.env.local` ships `NIM_API_KEY=` empty, so `npm run dev` never
 * reaches tier 3, and `npm run test:chat` replays its 240 cases against a
 * server that cannot use it: every case takes the regex path by construction.
 * The tier that writes prose was the only tier with no local check at all.
 *
 * It calls composeAnswer directly rather than going through the Worker, so it
 * measures the model and not the deployment, and it spends real tokens — a
 * dozen calls, which at gpt-oss-20b prices is not worth the cost of a script
 * that avoids them.
 *
 *   npm run check:model
 */
import { composeAnswer, nimConfigured } from '../lib/chat/nim.ts';

// Deliberately unmatched: these are what reach the model in production.
const QUESTIONS = [
  'wat is his tec stak',
  'Is he a good fit for a fintech backend role?',
  'What has he NOT worked on?',
  'Why should I not hire him?',
  'Does he have startup experience?',
  'Summarise his strongest three skills in one line',
  'मयूर ने क्या बनाया है?',
  'Has he ever shipped something that failed?',
];

// Chat.tsx aborts here. Anything slower is a call paid for and thrown away.
const CLIENT_TIMEOUT_MS = 8500;

if (!nimConfigured()) {
  console.error('\n  NIM_API_KEY is not set, so the model tier is off.\n');
  console.error('  Nothing here is broken — but be aware that `npm run test:chat`');
  console.error('  cannot cover tier 3 in this state, and did not.');
  console.error('  Set NIM_API_KEY in .env.local and re-run to exercise it.\n');
  process.exit(0);
}

let answered = 0;
let late = 0;
const latencies = [];

for (const question of QUESTIONS) {
  const started = Date.now();
  let result = null;
  try {
    result = await composeAnswer(question, [], []);
  } catch (error) {
    console.error(`  threw: ${error instanceof Error ? error.message : String(error)}`);
  }
  const ms = Date.now() - started;
  latencies.push(ms);
  if (result) answered += 1;
  if (ms > CLIENT_TIMEOUT_MS) late += 1;
  const flag = ms > CLIENT_TIMEOUT_MS ? ' PAST THE BROWSER TIMEOUT' : '';
  console.log(
    `  ${result ? 'answered' : 'fell back'} ${String(ms).padStart(6)}ms${flag.padEnd(26)} ${question.slice(0, 44)}`,
  );
  if (result) console.log(`           ${result.answer.replace(/\s+/g, ' ').slice(0, 96)}`);
}

latencies.sort((a, b) => a - b);
const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))];
console.log(`\n  answered ${answered}/${QUESTIONS.length}   p95 ${p95}ms   over budget ${late}/${QUESTIONS.length}`);
if (late > 0) {
  console.error('\n  A reply after 8500ms never reaches the visitor: Chat.tsx has already');
  console.error('  aborted and served the offline answer. Check TOTAL_BUDGET_MS.\n');
  process.exit(1);
}
