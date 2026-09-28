/**
 * `/sitemap.xml`, served by vinext's metadata-route support (the same
 * `app/sitemap.ts` convention as Next.js).
 *
 * Generated rather than a file in public/, so a dashboard added to
 * `content/dashboards.ts` is listed without anyone remembering to. `/admin`
 * is left out on purpose: it answers 404 to strangers and is `noindex`.
 *
 * The origin must match `metadataBase` in app/layout.tsx; a sitemap on another
 * host is ignored by crawlers. tests/dashboards.test.ts checks the two agree.
 */
import type { MetadataRoute } from 'next';
import { dashboards } from '@/content/dashboards';

export const ORIGIN = 'https://portfolio-template.example.workers.dev';

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    '/',
    '/dashboards',
    ...dashboards.map((d) => `/dashboards/${d.id}`),
    '/analytics',
    '/analytics/design-notes',
    '/privacy',
  ];
  return paths.map((path) => ({ url: new URL(path, ORIGIN).href }));
}
