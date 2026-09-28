/**
 * ANALYTICS.md, published.
 *
 * The /analytics showcase links to its design notes, and the repo they live
 * in is private, so a link to GitHub was a 404 for every visitor. This page
 * renders the file itself, imported as text at build time (`?raw`), so there
 * is no second copy to drift: editing ANALYTICS.md edits this page. That also
 * makes ANALYTICS.md public content, see CLAUDE.md.
 *
 * Static like /analytics: a committed file, no database, no request data.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import notes from '@/ANALYTICS.md?raw';
import { parseMarkdown } from '@/lib/markdown';
import { Markdown } from '@/components/showcase/Markdown';
import { profile } from '@/content/portfolio';

export const metadata: Metadata = {
  title: 'Analytics design notes · Alex Rivera',
  description:
    'Why the first-party analytics behind this portfolio works the way it does: ' +
    'section dwell, the click heatmap, the chat text policy, privacy and retention.',
  alternates: { canonical: '/analytics/design-notes' },
  openGraph: {
    title: 'Analytics design notes',
    description: 'The reasoning behind the first-party analytics on this portfolio.',
    url: '/analytics/design-notes',
    type: 'article',
    images: [{ url: profile.avatar, width: 720, height: 720, alt: profile.name }],
  },
};

// The file's own `# Analytics` title is replaced by the page header below.
const blocks = parseMarkdown(notes).filter((block) => !(block.kind === 'heading' && block.level === 1));
const contents = blocks.flatMap((block) => (block.kind === 'heading' && block.level === 2 ? [block] : []));

export default function DesignNotesPage() {
  return (
    <div className="design-notes">
      <header>
        <Link href="/analytics" className="design-notes-back">← Back to the analytics showcase</Link>
        <h1>Analytics design notes</h1>
        <p className="design-notes-lede">The engineering notes behind the dashboard at <Link href="/analytics">/analytics</Link>, published as they are kept in the repository. What is collected, in plain terms, is on the <Link href="/privacy">privacy page</Link>.</p>
      </header>
      <nav aria-label="Contents" className="design-notes-toc"><h2>Contents</h2><ol>{contents.map((h) => <li key={h.id}><a href={`#${h.id}`}>{h.text.replace(/`/g, '')}</a></li>)}</ol></nav>
      <article><Markdown blocks={blocks}/></article>
    </div>
  );
}
