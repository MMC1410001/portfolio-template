/**
 * An answer, rewritten for a voice rather than an eye.
 *
 * ── Why this is a separate file with no imports ───────────────────────────
 * It is unit-tested, and `npm run test:units` runs under
 * `node --experimental-strip-types` with the twenty-line resolver hook in
 * `tests/ts-hooks.mjs`. A bare Node process has to be able to import this, so
 * it may not touch the DOM, `window`, or `speechSynthesis`. Those live in
 * `hooks/use-speech.ts`. The same rule already governs
 * `lib/analytics/normalise.ts` and `components/admin/table-sort.ts`.
 *
 * ── What reading an answer aloud actually breaks ──────────────────────────
 * The answers in `content/faq.ts` were written to be read, and three habits
 * that are fine on screen are unbearable in a voice:
 *
 *   - Contact details. Every browser's synthesiser spells an email address
 *     out character by character, and the address in `profile.email` is
 *     twenty-eight of them. The phone number fares no better. Both are on
 *     screen already, so the voice points at them instead of reciting them.
 *   - URLs, for the same reason, plus "h t t p s colon slash slash".
 *   - The `·` separator. It is a visual divider in "Open to opportunities ·
 *     60-day notice", and a synthesiser either ignores it, running two
 *     clauses together, or pronounces it. A full stop is what was meant.
 *
 * Everything else is left alone. Rewriting prose for a voice beyond this is
 * how a spoken answer stops matching the text beside it, and the text is the
 * approved version.
 */

/** Above this, a spoken answer stops being an answer and becomes a monologue. */
const MAX_SPOKEN_CHARS = 1400;

const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
// Three shapes, because one was not enough and the gap only showed up when
// the sample data changed. The five-and-five grouping covers the common
// Indian mobile; the second alternative covers anything written as a country
// code followed by digits in any grouping, which is what "+1 555 0142" is and
// what the first two patterns both missed — a forked site would have had its
// owner's number spelled out digit by digit by the synthesiser.
//
// Every alternative that allows spaces between groups REQUIRES a leading +,
// which is what keeps "2 years 4 months" and a year range out of it.
const PHONE = /(?:\+\d{1,3}[\s-]?)?\b\d{5}[\s-]?\d{5}\b|\+\d{1,3}(?:[\s-]?\d){6,14}|(?:\+\d{1,3}[\s-]?)\d{6,12}\b/g;
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+|\b[\w-]+\.(?:com|ai|io|dev|org|net|in|example)\b\/?\S*/gi;

/**
 * The answer as it should be spoken.
 *
 * Returns an empty string when nothing speakable is left, which the caller
 * treats as "say nothing" rather than speaking a stray full stop.
 */
export function speakable(answer: string): string {
  if (!answer) return '';

  // An answer that lists every certificate carries ten URLs. Pointing at
  // each one individually produces "the link shown on screen" ten times,
  // which is worse than the addresses would have been. Past two, they are
  // dropped and mentioned once at the end instead.
  const links = answer.match(URL)?.length ?? 0;
  const many = links > 2;

  let text = answer
    .replace(EMAIL, 'his email address, shown on screen')
    .replace(URL, many ? '' : 'the link shown on screen')
    .replace(PHONE, 'his phone number, shown on screen')
    // A visual divider, not a pause the synthesiser knows about.
    .replace(/\s*·\s*/g, '. ')
    // Curly quotes read the same and confuse some engines.
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    // A non-breaking hyphen inside "under‑2‑second" is not a hyphen to a
    // synthesiser; the model emits these and they come out as pauses.
    .replace(/‑/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  // The same pointer twice in one breath is worse than the address.
  text = text.replace(/(\bshown on screen\b)(.*?)\1/g, '$1$2it');

  // A sentence that is now only punctuation, left behind by a stripped URL.
  text = text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => /[a-z0-9]/i.test(sentence))
    .join(' ')
    .replace(/\s*\.\s*\./g, '.')
    .trim();

  if (many) text = `${text.replace(/\s+([.,])/g, '$1').trim()} Every link is on screen beside this answer.`;

  if (text.length > MAX_SPOKEN_CHARS) {
    // Cut at a sentence boundary rather than mid-word, and only fall back to
    // a hard slice if there is no boundary to find.
    const clipped = text.slice(0, MAX_SPOKEN_CHARS);
    const lastStop = clipped.lastIndexOf('. ');
    text = lastStop > MAX_SPOKEN_CHARS / 2 ? clipped.slice(0, lastStop + 1) : clipped.trim();
  }

  return text;
}

/**
 * The voice to speak it in, from whatever the browser happens to offer.
 *
 * Pure so it can be tested: the caller passes `speechSynthesis.getVoices()`.
 * Indian English first, because it is the accent the person being described
 * actually has, then British, then anything English, then nothing at all,
 * which leaves the browser to pick its own default.
 */
export function pickVoice<T extends { lang: string; localService?: boolean }>(
  voices: readonly T[],
): T | null {
  if (!voices.length) return null;
  const english = voices.filter((voice) => /^en\b|^en-/i.test(voice.lang));
  if (!english.length) return null;
  const byLang = (tag: string) => english.filter((voice) => voice.lang.replace('_', '-').toLowerCase().startsWith(tag));
  // A local voice is preferred within each tier: it is faster to start and,
  // unlike a network voice, nothing about the answer leaves the device.
  const preferLocal = (list: T[]) => list.find((voice) => voice.localService) ?? list[0];
  const tiers = [byLang('en-in'), byLang('en-gb'), english];
  for (const tier of tiers) if (tier.length) return preferLocal(tier) ?? null;
  return null;
}

/**
 * One answer, split into utterance-sized pieces.
 *
 * Chrome stops speaking after roughly fifteen seconds of a single utterance
 * and never fires `end`, which for an answer of a few hundred words means it
 * trails off mid-sentence and the UI believes it is still talking. Queuing a
 * sequence of short utterances sidesteps it, and has the side benefit that
 * stopping is near-instant because only the current piece has to be dropped.
 *
 * Splits on sentence ends, then on commas if a sentence is still too long,
 * and only as a last resort mid-clause. Pure, so it is tested.
 */
const CHUNK_CHARS = 170;

export function chunkForSpeech(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sentences = trimmed.match(/[^.!?]+[.!?]*\s*/g) ?? [trimmed];
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = '';
  };

  for (const sentence of sentences) {
    if (sentence.trim().length > CHUNK_CHARS) {
      flush();
      // Too long on its own: break at commas, then hard-wrap whatever is left.
      let rest = sentence.trim();
      while (rest.length > CHUNK_CHARS) {
        const window = rest.slice(0, CHUNK_CHARS);
        const at = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '), window.lastIndexOf(' '));
        const cut = at > CHUNK_CHARS / 3 ? at + 1 : CHUNK_CHARS;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (rest) chunks.push(rest);
      continue;
    }
    if ((current + sentence).trim().length > CHUNK_CHARS) flush();
    current += sentence;
  }
  flush();
  return chunks.filter(Boolean);
}

/**
 * What to say when the browser accepted the audio and never played it.
 *
 * The message used to end "It works in Safari", asserted rather than
 * detected, so a Safari visitor whose engine wedged was told to use the
 * browser they were already in. The engine failing is rare; being told
 * something visibly untrue about your own screen is not a rare kind of bug,
 * and it costs more trust than the silence did.
 *
 * Pure, and takes the user-agent string, so it is tested rather than
 * reasoned about. Chromium-based browsers all carry "Safari" in their UA, so
 * the check is Safari AND NOT the engines that impersonate it.
 */
export function speechFailureHint(userAgent: string): string {
  const ua = userAgent || '';
  const impostor = /Chrom(?:e|ium)|Edg\/|OPR\/|SamsungBrowser/i.test(ua);
  const safari = /Safari/i.test(ua) && !impostor;
  const base = 'Your browser accepted the audio but never played it, so the voice is off.';
  // Naming a browser we know the visitor is not already using is the only
  // case where the suggestion can help.
  return safari ? `${base} Reloading the page sometimes clears it.` : `${base} It works in Safari.`;
}
