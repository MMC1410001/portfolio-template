/**
 * `/dashboards/<id>`: one dashboard per URL.
 *
 * ── What "static" means here, precisely ──────────────────────────────────
 * `vinext build` does not emit prerendered HTML for any route in this project
 * (`/` and `/analytics` included) so `generateStaticParams` is not
 * producing ten files on disk, and the build's route table honestly labels
 * this one `ƒ Dynamic` because it carries a segment. What it does guarantee
 * is the property that actually matters: the slug set is enumerated from
 * `content/dashboards.ts` at build time rather than trusted from the URL, and
 * the render reads a committed module: no database, no auth, no `headers()`
 * or `searchParams`. There is nothing here that can fail in front of a
 * visitor, which is the same reasoning `/analytics` is built on.
 *
 * `/` is untouched by this route and stays classified exactly as it was.
 *
 * ── `dynamicParams = false` is the guard, not a default ───────────────────
 * Without it, `/dashboards/anything` renders this page and `notFound()` is
 * the only thing between a typo and a 200. With it the ten enumerated slugs
 * are the only ones that resolve, and `notFound()` becomes the belt to that
 * braces, verified: `/dashboards/not-a-dashboard` is a 404.
 */
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { dashboards } from '@/content/dashboards';
import { DashboardDetail } from '@/components/dashboards/DashboardDetail';

export const dynamicParams = false;

export function generateStaticParams() {
  return dashboards.map((d) => ({ slug: d.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const d = dashboards.find((x) => x.id === slug);
  if (!d) return {};
  // The description is the tagline plus the sanitisation claim, because this
  // is the text a search result or a link preview shows: "dashboard on
  // synthetic data" belongs in front of anyone who might otherwise assume
  // they are about to see a client's live numbers.
  const description = `${d.tagline} Built at Northwind, rebuilt here on synthetic data with every name and figure changed.`;
  return {
    title: `${d.name}, operational dashboards`,
    description,
    alternates: { canonical: `/dashboards/${d.id}` },
    openGraph: {
      title: `${d.name}, operational dashboards`,
      description,
      url: `/dashboards/${d.id}`,
      type: 'article',
    },
  };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dashboard = dashboards.find((d) => d.id === slug);
  if (!dashboard) notFound();
  return <DashboardDetail dashboard={dashboard} />;
}
