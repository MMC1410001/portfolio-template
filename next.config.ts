/**
 * Security response headers.
 *
 * ── This file is no longer inert ───────────────────────────────────────────
 * It used to be an empty stub kept for Next-compat surface, and the note in
 * CLAUDE.md said editing it did nothing. That was true of the stub, not of the
 * file: vinext resolves `config.headers()` in `dist/config/next-config.js` and
 * applies the matched rules in `dist/server/config-headers.js`, which
 * `app-rsc-handler.js` and `pages-request-pipeline.js` both call. So this is
 * the one place that can set a header on the HTML documents as well as on the
 * API routes, a route handler can only set its own.
 *
 * Before this, `curl -I /` returned no CSP, no nosniff, no Referrer-Policy and
 * no frame-ancestors. There is no middleware.ts, and `public/_headers` is a
 * Cloudflare *Pages* convention that a Worker deploy never reads, so neither
 * was an alternative.
 *
 * ── Why the CSP is production-only ─────────────────────────────────────────
 * `vinext dev` serves Vite's HMR client, which opens a websocket and injects
 * its own script. A `connect-src 'self'` would break the dev loop while
 * protecting a machine nobody can reach. Production is where the header
 * matters, so that is where it is sent.
 *
 * ── Why script-src still allows inline ─────────────────────────────────────
 * React Server Components stream their hydration payload as inline
 * `<script>` tags. Removing 'unsafe-inline' means per-request nonces threaded
 * through the renderer, which is a real feature and not a header change, and
 * a static `/` cannot carry a per-request nonce at all without becoming
 * dynamic, which the routing rules here explicitly protect against.
 *
 * So this CSP does not pretend to stop script injection. It closes the
 * directives that are free and absolute: no plugins, no base-tag hijack, no
 * form posting to another origin, and no framing by anyone but us. That last
 * one has to stay 'self' rather than 'none', /admin frames the homepage to
 * screenshot it behind the click heatmap.
 *
 * ── The Google entries are load-bearing, and fail production-only ──────────
 * /admin offers Google sign-in, which pulls a script from accounts.google.com,
 * calls back to it, and renders its button in an iframe. Because this header
 * is only sent in production, omitting any of the three below leaves sign-in
 * working perfectly in `npm run dev` and dead on the deployed Worker, with the
 * only symptom in the browser console. They are listed per-directive rather
 * than widened into default-src so the allowance stays scoped to the one
 * origin that needs it.
 */
import type { NextConfig } from 'next';

const CSP = [
  "default-src 'self'",
  // See the note above: inline is load-bearing for RSC hydration.
  // accounts.google.com serves the Google Identity Services client used by
  // the /admin sign-in card.
  "script-src 'self' 'unsafe-inline' https://accounts.google.com",
  // Tailwind v4 and the hand-written token sheet both emit inline style.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // /api/chat and /api/track are same-origin; the one exception is Google
  // Identity Services, which fetches its own config during sign-in.
  "connect-src 'self' https://accounts.google.com",
  // The Google sign-in button renders inside an accounts.google.com iframe.
  "frame-src 'self' https://accounts.google.com",
  // Nothing here spawns a worker since the three.js scene was replaced by the
  // scroll-driven turntable; blob: stays because tightening it buys nothing
  // and a bundler that starts using a blob worker would fail silently.
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // 'self', not 'none': the admin heatmap frames / to draw a backdrop.
  "frame-ancestors 'self'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Superseded by frame-ancestors everywhere that matters, kept for the
  // browsers that still only read this one.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  {
    key: 'Permissions-Policy',
    // The site asks for none of these. Saying so denies them to anything that
    // ends up embedded here later.
    value:
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), ' +
      'magnetometer=(), microphone=(), payment=(), usb=()',
  },
  // Ignored by browsers over plain HTTP, so this is inert on localhost.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains',
  },
];

/**
 * Two sources, and the second is not redundant.
 *
 * vinext's matcher does not treat `/:path*` as matching the bare root, tested:
 * with only that rule, /privacy and /analytics carried the headers and `/` did
 * not. The homepage is the page most worth protecting, and it would have been
 * the one page silently left out.
 */
const SOURCES = ['/', '/:path*'];

const nextConfig: NextConfig = {
  async headers() {
    const headers =
      process.env.NODE_ENV === 'production'
        ? [...SECURITY_HEADERS, { key: 'Content-Security-Policy', value: CSP }]
        : SECURITY_HEADERS;
    return SOURCES.map((source) => ({ source, headers }));
  },
};

export default nextConfig;
