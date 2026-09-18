/**
 * `/analytics`: the public showcase.
 *
 * ── Why this is a separate route from /admin ───────────────────────────────
 * `/admin` is gated, `force-dynamic`, and answers 404 to strangers. This is
 * public, static, and has no credential path at all. Those are opposite
 * postures, and expressing them as two routes means neither can accidentally
 * become the other: there is no flag here that could be flipped to expose real
 * data, because there is no database call to flip it on.
 *
 * ── Statically rendered, deliberately ──────────────────────────────────────
 * No `force-dynamic` and no `headers()` call, so this prerenders to HTML at
 * build time. The dataset is a committed JSON import, so the page has nothing
 * to wait for and nothing that can fail at request time.
 *
 * ── Indexable, unlike /admin ───────────────────────────────────────────────
 * `app/admin/layout.tsx` sets `robots: { index: false }` because a crawler
 * that finds it gets a 404 anyway. The opposite applies here: this page is
 * something to be found. It is the one page on the site that shows engineering
 * work rather than describing it.
 */
import type { Metadata } from 'next';
import { ShowcaseShell } from '@/components/showcase/ShowcaseShell';
import { AdminTheme } from '@/components/admin/ThemeToggle';

export const metadata: Metadata = {
  title: 'Analytics dashboard, on sample data',
  description:
    'A working copy of the first-party analytics dashboard behind this ' +
    'portfolio: section dwell, click heatmap and chatbot coverage, running on ' +
    'synthetic data. No third-party scripts, and no visitor IP is ever stored.',
  alternates: { canonical: '/analytics' },
  openGraph: {
    title: 'Analytics dashboard, on sample data',
    description:
      'First-party analytics for a portfolio: section dwell, click heatmap, ' +
      'chatbot coverage gaps. Shown on synthetic data.',
    url: '/analytics',
    type: 'website',
  },
};

export default function AnalyticsShowcasePage() {
  // AdminTheme, not a bespoke wrapper: it puts `.dark` on a div rather than on
  // <html>, which is exactly what this page needs. Portfolio.tsx toggles
  // `.dark` on <html> for immersive mode, so anything writing there would be
  // clobbered by a client-side navigation from the homepage.
  return (
    <AdminTheme>
      <ShowcaseShell />
    </AdminTheme>
  );
}
