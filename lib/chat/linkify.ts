/**
 * Splitting an answer into text and the links inside it.
 *
 * ── Why answers now carry links at all ────────────────────────────────────
 * A message rendered as `<p>{text}</p>` can show one link, the `href` on the
 * answer, and it renders as "View source" at the bottom. That is fine for an
 * answer about one thing and useless for the three questions this was built
 * for: every certificate, every repository, every client site. A recruiter
 * asking "what has he certified?" wants to click through and verify, in the
 * panel, without being sent to the page to hunt.
 *
 * ── Why a segment list rather than HTML ───────────────────────────────────
 * The obvious version builds a string of anchors and sets
 * dangerouslySetInnerHTML, and that would take approved prose and hand it to
 * the HTML parser. The model tier writes some of these answers. Returning
 * segments keeps React escaping every character of the text and lets only a
 * matched URL become an href.
 *
 * ── Why this is a separate file with no imports ───────────────────────────
 * Same rule as `speech-text.ts`, `session.ts`, `language.ts` and
 * `stream-client.ts`: unit-tested in a bare Node process, so no DOM and no
 * React. It returns data; `Chat.tsx` turns it into elements.
 */

/**
 * Only http and https, deliberately.
 *
 * `javascript:` and `data:` must never reach an href, and the cheapest way
 * to guarantee that is a pattern that cannot express them. The trailing
 * class excludes the punctuation that ends a sentence, so "see https://x.io."
 * links the URL and leaves the full stop as text.
 */
const LINK = /https?:\/\/[^\s<>()[\]"']+[^\s<>()[\]"'.,;:!?]/g;

export interface Segment {
  text: string;
  /** Present when this segment is a link; always http(s). */
  href?: string;
}

/** The answer as alternating prose and links, in order. */
export function linkSegments(answer: string): Segment[] {
  const text = answer ?? '';
  if (!text) return [];
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const start = match.index;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: match[0], href: match[0] });
    last = start + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/**
 * A link, shortened for reading.
 *
 * A Sample Academy certificate URL is 78 characters of opaque identifier and there
 * are ten of them in one answer. Showing the host and a hint of the path is
 * what a person actually reads; the href stays whole.
 */
export function linkLabel(href: string): string {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, '');
    const path = url.pathname.replace(/\/$/, '');
    if (!path || path === '/') return host;
    const last = path.split('/').filter(Boolean).pop() ?? '';
    // An opaque id tells the reader nothing; the host already told them who
    // issued it, which is the part that matters for a certificate.
    if (last.length > 24 || /^[A-Za-z0-9_-]{16,}$/.test(last)) return host;
    return `${host}/${last}`;
  } catch {
    return href;
  }
}
