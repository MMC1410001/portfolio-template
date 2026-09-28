/**
 * `/robots.txt`, via vinext's metadata-route support.
 *
 * `/admin` is deliberately not named here. It answers 404 to strangers and
 * carries `noindex` (app/admin/layout.tsx); a Disallow line would be the one
 * public file advertising that it exists. It is also absent from the sitemap.
 * `/api/` is POST-only and has nothing a crawler can use.
 */
import type { MetadataRoute } from 'next';
import { ORIGIN } from './sitemap';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: new URL('/sitemap.xml', ORIGIN).href,
  };
}
