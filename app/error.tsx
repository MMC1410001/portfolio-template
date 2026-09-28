'use client';
/**
 * The route-level error boundary: what a visitor sees when a page throws
 * while rendering, instead of a blank document.
 *
 * The lazy chunks that fail most often (Experience mode, one dashboard board)
 * have their own boundaries nearer the failure, which keep the rest of the
 * page. This is the net under everything else. It sits inside the root
 * layout, so fonts, globals.css and the analytics provider are still there,
 * which is also why it can report itself: 'route' is the error row that says
 * a whole page failed rather than one feature.
 *
 * A client component by contract (it receives `reset`), so it cannot export
 * metadata; the layout's title stands, which is accurate enough for a page
 * that is the site with something broken in it.
 */
import { useEffect } from 'react';
import Link from 'next/link';
import { queueEvent } from '@/lib/analytics/queue';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[portfolio] route failed to render', error);
    queueEvent('error', { props: { scope: 'route' } });
  }, [error]);
  return (
    <main className="mx-auto grid min-h-[70vh] max-w-xl content-center gap-4 px-6 py-16" role="alert">
      <p className="font-mono text-xs tracking-[.12em] text-[#596579] uppercase">Something went wrong</p>
      <h1 className="text-4xl font-medium tracking-tight">This page failed to load.</h1>
      <p className="text-[#596579]">
        Usually a dropped connection, or the site being updated while the page was open. Trying again often works.
      </p>
      {/* Colour and underline sit on the <span>: globals.css resets `a` and
          `button` in unlayered rules, which beat any utility on the element. */}
      <p className="flex flex-wrap items-center gap-6 font-semibold">
        <button type="button" onClick={reset}><span className="block rounded-md bg-[#172235] px-4 py-2 text-white hover:bg-[#285ce5]">Try again</span></button>
        <Link href="/"><span className="text-[#285ce5] underline underline-offset-4">Back to the portfolio</span></Link>
      </p>
    </main>
  );
}
