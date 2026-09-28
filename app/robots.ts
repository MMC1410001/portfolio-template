/**
 * `/robots.txt`, via vinext's metadata-route support.
 *
 * `/admin` is deliberately not named here. In production, where ADMIN_TOKEN
 * is always set, it answers a stranger with the sign-in form (it 404s only
 * when no token is configured), and that form carries `noindex`
 * (app/admin/layout.tsx). `noindex` is the rule that keeps it out of search
 * results, and a crawler can only read it on a page it is allowed to fetch:
 * a Disallow line would stop the fetch, not the listing, so a linked URL
 * could still appear as a bare result, and robots.txt would become the one
 * public file advertising that the route exists. It is also absent from the
 * sitemap.
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
