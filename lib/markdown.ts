/**
 * Just enough Markdown to publish ANALYTICS.md at /analytics/design-notes.
 *
 * ── Why not a library ─────────────────────────────────────────────────────
 * The one document this renders uses headings, hard-wrapped paragraphs,
 * flat lists, tables, fenced code and three inline marks. That is about a
 * hundred lines, and it returns data rather than an HTML string, so the page
 * renders React elements and never needs dangerouslySetInnerHTML: the text is
 * escaped by React like any other string, whatever the file contains.
 *
 * Anything it does not recognise falls through as paragraph text, which is
 * the honest failure: visible, unstyled, never dropped.
 *
 * ── Why a separate file with no imports ───────────────────────────────────
 * `npm run test:units` imports it in a bare Node process. No DOM, no React.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] };

export type Block =
  | { kind: 'heading'; level: number; id: string; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] };

const FENCE = /^```/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const CONTINUATION = /^\s{2,}\S/;

/** A heading's anchor: lowercase words joined by hyphens, marks removed. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  const seen = new Map<string, number>();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (FENCE.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      i += 1; // the closing fence, or the end of an unclosed one
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const text = heading[2].trim();
      // Two headings with the same words still need distinct anchors.
      const base = slugify(text) || 'section';
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      blocks.push({ kind: 'heading', level: heading[1].length, id: n ? `${base}-${n}` : base, text });
      i += 1;
      continue;
    }

    if (line.trimStart().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('|')) rows.push(cells(lines[i++]));
      // The second row is the |---|---| separator when this is a real table.
      const separated = rows.length > 1 && rows[1].every((cell) => /^:?-+:?$/.test(cell));
      blocks.push(separated ? { kind: 'table', head: rows[0], rows: rows.slice(2) } : { kind: 'paragraph', text: rows.map((r) => r.join(' | ')).join(' ') });
      continue;
    }

    const first = ITEM.exec(line);
    if (first) {
      const ordered = /\d/.test(first[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const item = ITEM.exec(lines[i]);
        if (item && /\d/.test(item[2]) === ordered) {
          items.push(item[3]);
          i += 1;
        } else if (items.length && CONTINUATION.test(lines[i])) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i += 1;
        } else if (!lines[i].trim() && ITEM.exec(lines[i + 1] ?? '')) {
          i += 1; // a blank line between two items of one list
        } else break;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !FENCE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !ITEM.test(lines[i]) &&
      !lines[i].trimStart().startsWith('|')
    ) {
      para.push(lines[i++].trim());
    }
    blocks.push({ kind: 'paragraph', text: para.join(' ') });
  }

  return blocks;
}

/**
 * Inline marks, in precedence order: a code span is taken first and nothing
 * inside it is interpreted, so `*` in `a*b` stays an asterisk.
 */
const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])\*(?!\s)([^*]+?)\*(?![\w*])/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push({ kind: 'text', text: rest });
      break;
    }
    if (m.index) out.push({ kind: 'text', text: rest.slice(0, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'code', text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: 'strong', children: parseInline(m[2]) });
    else if (m[3] !== undefined) out.push({ kind: 'link', href: m[4], children: parseInline(m[3]) });
    else out.push({ kind: 'em', children: parseInline(m[5]) });
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}
