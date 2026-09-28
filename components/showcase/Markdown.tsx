import type { ReactNode } from 'react';
import { parseInline, type Block, type Inline } from '@/lib/markdown';

// Server component: the parse and the render both happen at build time, and
// none of this reaches the client bundle.

/** Only links that go somewhere ordinary. A `javascript:` href renders as text. */
const SAFE_HREF = /^(https?:\/\/|\/|#)/;

function inline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, at) => {
    switch (node.kind) {
      case 'text': return node.text;
      case 'code': return <code key={at}>{node.text}</code>;
      case 'strong': return <strong key={at}>{inline(node.children)}</strong>;
      case 'em': return <em key={at}>{inline(node.children)}</em>;
      case 'link': return SAFE_HREF.test(node.href)
        ? <a key={at} href={node.href} {...(node.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>{inline(node.children)}</a>
        : <span key={at}>{inline(node.children)}</span>;
    }
  });
}

const text = (source: string) => inline(parseInline(source));

export function Markdown({ blocks }: { blocks: Block[] }) {
  return <>{blocks.map((block, at) => {
    switch (block.kind) {
      case 'heading': {
        const Tag = `h${Math.min(block.level, 6)}` as 'h2';
        return <Tag key={at} id={block.id}><a href={`#${block.id}`} className="md-anchor">{text(block.text)}</a></Tag>;
      }
      case 'paragraph': return <p key={at}>{text(block.text)}</p>;
      case 'code': return <pre key={at}><code>{block.text}</code></pre>;
      case 'list': {
        const items = block.items.map((item, n) => <li key={n}>{text(item)}</li>);
        return block.ordered ? <ol key={at}>{items}</ol> : <ul key={at}>{items}</ul>;
      }
      case 'table': return <div key={at} className="md-table"><table><thead><tr>{block.head.map((cell, n) => <th key={n} scope="col">{text(cell)}</th>)}</tr></thead><tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, n) => <td key={n}>{text(cell)}</td>)}</tr>)}</tbody></table></div>;
    }
  })}</>;
}
