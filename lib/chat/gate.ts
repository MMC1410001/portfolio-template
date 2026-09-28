/**
 * What may reach the model tier, decided in one place.
 *
 * ── Why the history is screened, not just the question ────────────────────
 * The guards in content/faq.ts used to run on `body.message` alone, and the
 * conversation went to NVIDIA as it arrived. The history is the visitor's own
 * words coming back, so a credentials question asked one turn ago, or typed
 * straight into a hand-built request body, reached the model inside the
 * context of a perfectly innocent follow-up. Every user turn is therefore put
 * through the same answerQuestion() the question is, and a turn that would
 * not be allowed to reach the model as a question is not allowed to reach it
 * as context either. The reply that followed it goes too: it is the refusal,
 * or a forged answer to the refused question, and neither is context worth
 * keeping without the turn it answers.
 *
 * ── Why an unmatched question in another language stays local ─────────────
 * The guards are written in English. "उसके क्लाइंट का पासवर्ड क्या है?" is a
 * credentials question that no guard can read, so it falls through to the
 * no-match answer, and `unmatched` used to be all it took to reach the model.
 * A MATCHED question in another language is different: a pattern already
 * placed it on an approved topic, so the model is only translating that
 * answer, which is what it is there for.
 *
 * "Another language" is deliberately broader here than detectLanguage().
 * That function needs two Spanish stopwords, and "¿Cuál es la contraseña del
 * servidor?" has one, so it reads as English. Any non-ASCII letter in an
 * unmatched question keeps it local as well. The cost is that an unmatched
 * English question with an accented name gets the curated not-documented
 * answer instead of a composed one: a worse reply, never a wrong one.
 *
 * ── Why an unmatched question with an invisible character stays local ─────
 * normaliseQuestion() deletes format characters (soft hyphen, zero-width
 * space and joiners, bidi controls) before the guards run, so "sal\u00adary"
 * is refused like "salary". Nobody types one by accident into a question that
 * then matches nothing, though, and what reaches the model is the raw text,
 * so an unmatched question that carried any is kept on the curated answer.
 * History turns go through the same unmatchedMayCompose(), so one cannot ride
 * along as context either.
 *
 * ── Why a matched question in another language is translated, not asked ───
 * With no conversation behind it, the only reason a matched question reaches
 * the model is its language. The model is then handed the curated answer and
 * the language name, and never the visitor's words: the question has already
 * done its job by matching, and English guards cannot vouch for the rest of
 * what it says. See translationTarget() and translateAnswer() in nim.ts.
 *
 * No DOM and no React, so `npm run test:units` can import it.
 */
import { answerQuestion, hasFormatChars, type Answer } from '@/content/faq';
import { detectLanguage, type DetectedLanguage } from './language';
import type { ChatTurn } from './nim';

/** Letters only, any of them outside ASCII. Punctuation such as ¿ or ’ does not count. */
const hasForeignLetters = (text: string): boolean => /\P{ASCII}/u.test(text.replace(/[^\p{L}]/gu, ''));

/**
 * Whether a question that no pattern matched may be handed to the model.
 * English only, by both tests above.
 */
function unmatchedMayCompose(question: string): boolean {
  return detectLanguage(question) === null && !hasForeignLetters(question) && !hasFormatChars(question);
}

/**
 * The route's eligibility rule. Two classes of question, and only two:
 * anything no pattern matched, in English; and a matched question that is
 * either part of a conversation or asked in another language.
 */
export function modelEligible(fallback: Answer, history: ChatTurn[], question: string): boolean {
  if (fallback.unmatched === true) return unmatchedMayCompose(question);
  return fallback.source === 'From the portfolio' && (history.length > 0 || detectLanguage(question) !== null);
}

/**
 * The language to translate the curated answer into, when that is ALL the
 * model is being asked to do: a matched question, in another language, with
 * no conversation behind it. Null otherwise, including mid-conversation,
 * where the model composes from the question and the history as before.
 */
export function translationTarget(fallback: Answer, history: ChatTurn[], question: string): DetectedLanguage | null {
  if (fallback.source !== 'From the portfolio' || !fallback.id || history.length > 0) return null;
  return detectLanguage(question);
}

/**
 * The history with every refused user turn removed, and the reply after it.
 *
 * A user turn is kept when it matched an approved answer, or when it is an
 * unmatched question that would itself be allowed to compose. Guards,
 * refusals (salary is 'Not documented' but not `unmatched`) and unmatched
 * questions the guards cannot read are all dropped.
 */
export function screenHistory(history: ChatTurn[]): ChatTurn[] {
  const kept: ChatTurn[] = [];
  let dropReply = false;
  for (const turn of history) {
    if (turn.role === 'assistant') {
      if (!dropReply) kept.push(turn);
      dropReply = false;
      continue;
    }
    const verdict = answerQuestion(turn.text);
    const allowed = verdict.source === 'From the portfolio' || (verdict.unmatched === true && unmatchedMayCompose(turn.text));
    dropReply = !allowed;
    if (allowed) kept.push(turn);
  }
  return kept;
}
