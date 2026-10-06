'use client';
/**
 * The last boundary: what renders when the root layout itself throws, which
 * app/error.tsx cannot catch because it sits inside that layout. It replaces
 * the layout, so it brings its own <html> and <body>, and it is styled inline
 * because neither globals.css nor the fonts can be assumed to have loaded.
 * Without this file vinext falls back to its built-in Next-style page.
 */
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[portfolio] root layout failed to render', error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fbfcff', color: '#172235', fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' }}>
        <main role="alert" style={{ maxWidth: 520, padding: '48px 24px' }}>
          <p style={{ margin: 0, fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#596579' }}>Something went wrong</p>
          <h1 style={{ margin: '12px 0', fontSize: 32, fontWeight: 500, letterSpacing: '-.02em' }}>The site failed to load.</h1>
          <p style={{ margin: '0 0 24px', lineHeight: 1.5, color: '#596579' }}>Usually a dropped connection, or the site being updated while the page was open. Trying again often works.</p>
          <p style={{ margin: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24, fontWeight: 600 }}>
            <button type="button" onClick={reset} style={{ border: 0, borderRadius: 6, padding: '8px 16px', background: '#172235', color: '#fff', font: 'inherit', cursor: 'pointer' }}>Try again</button>
            {/* A plain <a>, not next/link: a full navigation is the point when the app shell itself is broken. */}
            {/* oxlint-disable-next-line nextjs/no-html-link-for-pages -- see above */}
            <a href="/" style={{ color: '#285ce5', textUnderlineOffset: 4 }}>Back to the portfolio</a>
          </p>
        </main>
      </body>
    </html>
  );
}
