/**
 * The 404 page, for unknown paths and every `notFound()` call.
 *
 * Without this file vinext rendered its built-in 404 inside the root layout,
 * and that component writes its own `<title>`, so every 404 carried two: the
 * homepage's, from the layout metadata, and "404: This page could not be
 * found." Search engines and tab strips each pick one, and which is not
 * defined. Metadata here replaces the layout's title, so there is one.
 *
 * No `robots` field: vinext already emits `noindex` on every 404 response,
 * and a second robots tag here was a duplicate, not a stronger instruction.
 */
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Page not found, Alex Rivera',
};

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[70vh] max-w-xl content-center gap-4 px-6 py-16">
      <p className="font-mono text-xs tracking-[.12em] text-[#596579] uppercase">404</p>
      <h1 className="text-4xl font-medium tracking-tight">This page does not exist.</h1>
      <p className="text-[#596579]">
        The address may be mistyped, or the page may have moved.
      </p>
      {/* Colour and underline sit on the <span>: globals.css resets `a` and
          `button` in unlayered rules, which beat any utility on the element. */}
      <p className="flex flex-wrap gap-6 font-semibold">
        <Link href="/"><span className="text-[#285ce5] underline underline-offset-4">Back to the portfolio</span></Link>
        <Link href="/dashboards"><span className="text-[#285ce5] underline underline-offset-4">Operational dashboards</span></Link>
      </p>
    </main>
  );
}
