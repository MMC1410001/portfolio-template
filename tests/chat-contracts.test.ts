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
  // Two browser clocks. The HEADER ceiling is what the non-streaming path
  // has to beat, because it sends no headers until it has the whole answer.
  // This used to be compared against the 12s first-token watchdog instead,
  // which only starts once headers have arrived and so never bounded the
  // JSON path at all.
  const headerCeiling = Number(/const HEADER_CEILING_MS=(\d+)/.exec(chat)?.[1]);
  const firstToken = Number(/firstTokenMs:(\d+)/.exec(chat)?.[1]);
  assert.ok(budget > 0, 'TOTAL_BUDGET_MS not found in lib/chat/nim.ts');
  assert.ok(headerCeiling > 0, 'HEADER_CEILING_MS was not found in Chat.tsx');
  assert.ok(firstToken > 0, 'firstTokenMs was not found in Chat.tsx');
  assert.match(chat, /setTimeout\(\(\)=>controller\.abort\('slow'\),HEADER_CEILING_MS\)/, 'the header ceiling must actually abort');
  assert.ok(
    budget + 500 <= headerCeiling,
    `the Worker may spend ${budget}ms while the browser gives up waiting for headers at ${headerCeiling}ms`,
  );
  // Streaming is what the first-token watchdog is for, and it has to be
  // the looser clock or streaming buys nothing.
  assert.ok(firstToken > headerCeiling, 'the first-token watchdog must outlast the header ceiling');
  // And the stream's own ceiling looser still: the whole point is that a
  // 10.9s answer is readable from 1s.
  const streamTotal = Number(/export const STREAM_TOTAL_MS = (\d+)/.exec(nim)?.[1]);
  assert.ok(streamTotal > firstToken, 'the stream ceiling must outlast the first-token deadline');
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

test('a question cannot be sent while a reply is still streaming', () => {
  // `busy` clears at the first token. Guarding send() on it alone let a
  // second question race the first for one transcript, and took the Stop
  // button away while the first reply was still arriving.
  const chat = read('components/portfolio/Chat.tsx');
  assert.match(chat, /if\(!question\|\|busy\|\|streaming\)return;/);
  assert.match(chat, /\{busy\|\|streaming\?<button type="button" data-track-tag="chat-stop"/);
});

test('the transcript is marked private to the click tracker', () => {
  const chat = read('components/portfolio/Chat.tsx');
  assert.match(chat, /className="chat-messages"[^>]*data-track-private/);
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

test('the chat panel is non-modal, and stays open while the page is used', () => {
  // The point of the floating panel is that a visitor can scroll and click
  // the page with it open. Three settings make that true and each one alone
  // is not enough: modal={false} lifts the focus trap, scroll lock and
  // pointer blocking; disablePointerDismissal stops a non-modal dialog
  // closing on the first outside press, which would shut the panel the
  // instant they clicked the thing they opened it to ask about; and the
  // backdrop has to go, because modal={false} still renders one over a page
  // the visitor is meant to keep reading.
  const chat = read('components/portfolio/Chat.tsx');
  assert.match(chat, /<Sheet open=\{open\} modal=\{false\} disablePointerDismissal/);
  assert.match(chat, /<SheetContent showOverlay=\{false\}/);
  const sheet = read('components/ui/sheet.tsx');
  assert.match(sheet, /\{showOverlay && <SheetOverlay \/>\}/);
});

test('the transcript scrolls itself and not the page behind it', () => {
  // scrollIntoView walks every scrollable ancestor including the document.
  // That was invisible while the sheet was modal and the page was locked;
  // non-modal it drags the page behind the panel on every reply.
  const chat = read('components/portfolio/Chat.tsx');
  // A call, not the word: the comment explaining this rule mentions it.
  assert.ok(
    !/\.scrollIntoView\(/.test(chat),
    'use box.scrollTo / scrollTop so only the transcript moves',
  );
  assert.match(chat, /el\.scrollTo\(\{ *top:/);
});

test('opening the chat does not cancel the reveal countdown', () => {
  // The bug: <Chat onOpen={() => setAutoplay(false)} />. That reads as
  // "pause while they are busy" and is not — nothing ever sets autoplay back
  // to true, so opening the chat within the first three seconds cancelled
  // the theme change permanently. REVEAL_CONFIG's comment states the rule
  // this broke: only a hidden tab pauses the clock.
  const portfolio = read('components/portfolio/Portfolio.tsx');
  // Non-greedy to the first `/>`, NOT a negated character class: the first
  // version of this used [^/>]* and stopped dead at the `>` inside the
  // arrow function `()=>`, so it never saw the call it exists to catch and
  // passed with the bug reintroduced. Caught by mutation-testing it.
  const chatEl = /<Chat\b[\s\S]*?\/>/.exec(portfolio);
  assert.ok(chatEl, '<Chat> is not rendered by Portfolio.tsx');
  assert.ok(
    !chatEl[0].includes('setAutoplay'),
    `opening the chat must not touch the reveal clock: ${chatEl[0]}`,
  );
});

test('the panel is a lazy chunk behind an eager launcher that looks and tracks the same', () => {
  // The panel, the Sheet and the FAQ corpus were a third of the homepage's
  // JavaScript. Portfolio.tsx renders the launcher; only the launcher may
  // import Chat.tsx, and only dynamically.
  const portfolio = read('components/portfolio/Portfolio.tsx');
  assert.match(portfolio, /import Chat from '\.\/ChatLauncher';/);
  assert.ok(!/from '\.\/Chat'/.test(portfolio), 'Portfolio.tsx must not import the panel statically');
  const launcher = read('components/portfolio/ChatLauncher.tsx');
  assert.match(launcher, /import\('\.\/Chat'\)/);
  assert.ok(!/^import [^;]*(?:'\.\/Chat'|content\/faq|ui\/sheet)/m.test(launcher), 'the launcher must stay light');
  // What clicks.ts, cta.ts and the stylesheet read off the old SheetTrigger.
  assert.match(launcher, /data-track-tag="chat-open" data-track-cta="chat-open" className="chat-launcher"/);
  assert.match(launcher, /<MessageCircle size=\{19\}\/><span>Ask about Alex<\/span><span className="chat-dot"\/>/);
  const chat = read('components/portfolio/Chat.tsx');
  assert.ok(!chat.includes('SheetTrigger'), 'the launcher owns the trigger; the panel is controlled');
  assert.match(chat, /trackChatOpen\('launcher'\)/);
});

test('a JSON reply is checked before it is rendered', () => {
  const chat = read('components/portfolio/Chat.tsx');
  assert.ok(!/result=await response\.json\(\)/.test(chat), 'the JSON path must not cast the body');
  assert.match(chat, /toPayload\(data as Record<string,unknown>\)/);
});

test('a cancelled stream stops the model call and is not counted as a failure', () => {
  const route = read('app/api/chat/route.ts');
  assert.match(route, /cancel\(\)\{local\.abort\(\)\}/);
  assert.match(route, /AbortSignal\.any\(\[request\.signal,local\.signal\]\)/);
  assert.match(route, /failed:failed&&!cancelled/);
});

test('the Python tier is labelled for what it does, with the link of the answer it chose', () => {
  const route = read('app/api/chat/route.ts');
  assert.ok(!route.includes("data.mode==='ai'?'AI · grounded in portfolio'"), 'an id-picking tier is not "grounded" prose');
  assert.match(route, /source:'AI matched · portfolio facts',href:chosen\.href,ids:\[chosen\.id\]/);
});
