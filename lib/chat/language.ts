/**
 * What language was the question asked in?
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * Every approved answer in `content/faq.ts` is English, and a visitor who
 * asks in Hindi used to get either an English answer or, more often, the
 * not-documented fallback in English. Recruiters in India routinely mix
 * Hindi and English, and the site's own contact section lists Hindi and
 * Marathi among the languages Alex speaks, so answering only in English is
 * a gap rather than a policy.
 *
 * Nothing here translates anything. It names the language so the model tier
 * can be told to reply in it, still working only from the approved English
 * answers. If the model is unavailable the curated English answer is served
 * as before, which is a worse reply but never a wrong one.
 *
 * ── Why this is a separate file with no imports ───────────────────────────
 * Same rule as `speech-text.ts` and `session.ts`: it is unit-tested, and
 * `npm run test:units` imports it in a bare Node process. No DOM, no React.
 *
 * ── Why a share of the letters, and not a single character ────────────────
 * `content/faq.ts` folds Cyrillic homoglyphs onto ASCII precisely because a
 * single Cyrillic `о` hidden in an English sentence is an attack rather than
 * a language. Detecting "Russian" from one character would hand that attack
 * a new instruction line in the prompt. A script has to carry a real share
 * of the question's letters before it counts.
 */

/** A script must cover this much of the question's letters to name it. */
const SCRIPT_SHARE = 0.3;

/** Two stopwords, not one: single short words collide with English too easily. */
const MIN_STOPWORDS = 2;

interface Script {
  code: string;
  name: string;
  pattern: RegExp;
}

// Ordered so that a more specific script is tested before the block it sits
// inside: Japanese kana before the Han range they share with Chinese.
const SCRIPTS: Script[] = [
  { code: 'hi', name: 'Hindi', pattern: /[ऀ-ॿ]/g },
  { code: 'bn', name: 'Bengali', pattern: /[ঀ-৿]/g },
  { code: 'pa', name: 'Punjabi', pattern: /[਀-੿]/g },
  { code: 'gu', name: 'Gujarati', pattern: /[઀-૿]/g },
  { code: 'ta', name: 'Tamil', pattern: /[஀-௿]/g },
  { code: 'te', name: 'Telugu', pattern: /[ఀ-౿]/g },
  { code: 'kn', name: 'Kannada', pattern: /[ಀ-೿]/g },
  { code: 'ml', name: 'Malayalam', pattern: /[ഀ-ൿ]/g },
  { code: 'ar', name: 'Arabic', pattern: /[؀-ۿ]/g },
  { code: 'he', name: 'Hebrew', pattern: /[֐-׿]/g },
  { code: 'ko', name: 'Korean', pattern: /[가-힯ᄀ-ᇿ]/g },
  { code: 'ja', name: 'Japanese', pattern: /[぀-ヿ]/g },
  { code: 'zh', name: 'Chinese', pattern: /[一-鿿]/g },
  { code: 'ru', name: 'Russian', pattern: /[Ѐ-ӿ]/g },
  { code: 'el', name: 'Greek', pattern: /[Ͱ-Ͽ]/g },
];

/**
 * Latin-script languages, by function words.
 *
 * Deliberately short lists of words that carry no meaning in an English
 * question. `de` and `la` are omitted from Spanish because "de" appears in
 * names and "la" in "la carte"; the words kept are ones that would be odd in
 * an English sentence about a portfolio.
 */
const LATIN: { code: string; name: string; words: string[] }[] = [
  // Romanised Hindi and Marathi. This is the one that actually comes up: an
  // Indian recruiter typing "alex ne kya banaya hai" is not a rare visitor.
  {
    code: 'hi-Latn',
    name: 'Hindi (written in the Latin alphabet, so reply the same way)',
    words: ['kya', 'hai', 'hain', 'kaise', 'kaisa', 'kitna', 'kitne', 'kaun', 'kab', 'kyun', 'kyu', 'kahan', 'aapka', 'uska', 'unka', 'karta', 'karte', 'nahi', 'nahin', 'batao', 'bata', 'mujhe', 'kaam', 'banaya', 'kiya'],
  },
  { code: 'es', name: 'Spanish', words: ['qué', 'que', 'cuál', 'cuáles', 'cómo', 'cuánto', 'cuántos', 'dónde', 'tiene', 'sus', 'sobre', 'trabajo', 'experiencia'] },
  { code: 'fr', name: 'French', words: ['quelles', 'quels', 'quelle', 'quel', 'est-il', 'ses', 'son', 'sont', 'combien', 'où', 'travaille', 'compétences'] },
  { code: 'de', name: 'German', words: ['welche', 'welches', 'wie', 'wo', 'seine', 'seiner', 'hat', 'ist', 'kenntnisse', 'erfahrung', 'arbeitet'] },
  { code: 'pt', name: 'Portuguese', words: ['qual', 'quais', 'como', 'onde', 'quanto', 'suas', 'seus', 'trabalha', 'experiência'] },
];

export interface DetectedLanguage {
  /** A rough tag, for logging and tests. Not a BCP 47 guarantee. */
  code: string;
  /** How the model is told to describe it. Plain words, not a tag. */
  name: string;
}

/**
 * The language to answer in, or null for English.
 *
 * Null is the answer for English, for an empty question, and for anything
 * too short or too mixed to call. Null means "change nothing", so every
 * uncertain case costs a visitor nothing.
 */
export function detectLanguage(question: string): DetectedLanguage | null {
  const text = (question ?? '').trim();
  if (text.length < 2) return null;

  // Letters only: digits, spaces and punctuation are shared by every script
  // and would dilute the share below the threshold for a short question.
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (!letters.length) return null;

  for (const script of SCRIPTS) {
    const hits = letters.match(script.pattern)?.length ?? 0;
    if (hits / letters.length >= SCRIPT_SHARE) return { code: script.code, name: script.name };
  }

  // Latin script. Word-boundary matched on the lowercased question so that
  // "Kya" and "kya" count once each, and "kyathe" counts not at all.
  const words = new Set(text.toLowerCase().match(/[\p{L}']+/gu) ?? []);
  let best: { code: string; name: string; score: number } | null = null;
  for (const language of LATIN) {
    const score = language.words.reduce((total, word) => total + (words.has(word) ? 1 : 0), 0);
    if (score >= MIN_STOPWORDS && (!best || score > best.score)) {
      best = { code: language.code, name: language.name, score };
    }
  }
  return best ? { code: best.code, name: best.name } : null;
}
