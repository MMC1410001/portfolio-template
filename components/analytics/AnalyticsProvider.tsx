'use client';
/**
 * Mounts the instrumentation. Renders nothing.
 *
 * Lives in app/layout.tsx rather than inside Portfolio.tsx for three reasons:
 * importing a client component from a server layout is the standard App Router
 * pattern and costs nothing; it survives any future route; and it keeps the
 * installers out of a subtree that could remount.
 *
 * It also mounts on /admin, which is correct: the exit hooks stay registered
 * there in case of a client-side navigation back to /, while the click,
 * scroll, section and CTA listeners are left uninstalled, because
 * trackingSuppressed() would refuse everything they produced.
 *
 * ── Why it reads the pathname ─────────────────────────────────────────────
 * A next/link navigation keeps this component, the document and every module
 * listener, and swaps the page. Without being told, the section observer kept
 * watching the old nodes and scroll milestones stayed "already reached", so a
 * round trip through /dashboards ended section tracking for the session.
 * syncAnalyticsRoute() in hooks/analytics-route.ts is what resets them.
 *
 * usePathname() does not make `/` dynamic, unlike useSearchParams(): vinext
 * reads it from the navigation context on the server and from a subscription
 * on the client, with no bailout. `npm run build` is the check.
 */
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { installAnalytics } from '@/lib/analytics/install';
import { syncAnalyticsRoute } from '@/hooks/analytics-route';

export default function AnalyticsProvider() {
  const pathname = usePathname();
  // Declared first so it runs first: the route sync below must find the
  // landing page already installed and record it, not reset it.
  useEffect(() => {
    const reduced =
      typeof matchMedia === 'function'
        ? matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    installAnalytics(reduced);
  }, []);
  useEffect(() => {
    syncAnalyticsRoute(pathname);
  }, [pathname]);
  return null;
}
