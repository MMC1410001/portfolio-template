/**
 * "Why should we hire him?", and every other way a recruiter asks it.
 *
 * Every other matched first question gets its curated answer verbatim: a
 * first question is a topic lookup, and the curated text is the best reply
 * (see modelEligible in gate.ts). A fit question is the exception, because
 * the same curated pitch is a worse answer to "would he suit a senior SDET
 * role?" than to "why hire him?". So a fit question goes to the model even
 * with no conversation behind it, with `why-hire` pinned into its shortlist
 * beside whatever entry the question matched, and the curated answer is the
 * fallback when the model fails.
 *
 * Unmatched questions reach the model already. What they lacked was the
 * pitch: the shortlist is token overlap, "why" is a stopword and "alex" is
 * in every answer, so "Why Alex?" was answered from the bio. FIT_WORDS pins
 * `why-hire` for those as well.
 *
 * Salary never gets here. guard.compensation answers it first, and that
 * answer is not model-eligible.
 *
 * No DOM and no React, so `npm run test:units` can import it.
 */
import { answerQuestion, answers, normaliseQuestion, type Answer } from '@/content/faq';

export const FIT_ID = 'why-hire';

/**
 * Bare "hire" is not here: "is he available for hire" is an availability
 * question, and the phrasings that do ask why are why-hire patterns already.
 */
const FIT_WORDS = /\b(?:fits?|suitable|suited|suit|candidates?|why (?:alex|him)|hire (?:him|alex)|start-?ups?|right person|good match)\b/;

/**
 * Whether this question asks if Alex suits a role, a team or a company.
 *
 * A question another entry matched counts too: "is he suitable for a Java
 * backend role?" matches `skills` on "java", and the skills list alone does
 * not answer it. Guarded questions never count, whatever words they use.
 */
export function isFitQuestion(question: string): boolean {
  const answer = answerQuestion(question);
  if (answer.id === FIT_ID) return true;
  if (answer.unmatched !== true && answer.source !== 'From the portfolio') return false;
  // "Why should we NOT hire him?" asks for the opposite of the pitch.
  if (answer.id === 'behavioural') return false;
  return FIT_WORDS.test(normaliseQuestion(question));
}

/**
 * The pitch, in place of "not documented", for a fit question no pattern
 * matched. "Is he better than other candidates?" is answered by the model
 * when it can be; when the model declines or fails, the visitor still gets
 * the reasons rather than an invitation to ask about something else.
 */
export function withFitFallback(question: string, answer: Answer): Answer {
  if (answer.unmatched !== true || !isFitQuestion(question)) return answer;
  const pitch = answers.find((entry) => entry.id === FIT_ID);
  return pitch ? { answer: pitch.answer, href: pitch.href, mode: 'faq', source: 'From the portfolio', id: FIT_ID } : answer;
}
