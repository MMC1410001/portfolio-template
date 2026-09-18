'use client';
/**
 * Mounts the instrumentation. Renders nothing.
 *
 * Lives in app/layout.tsx rather than inside Portfolio.tsx for three reasons:
 * importing a client component from a server layout is the standard App Router
 * pattern and costs nothing; it survives any future route; and it keeps the
 * installers out of a subtree that could remount.
 *
 * It also mounts on /admin, which is correct, trackingSuppressed() checks the
 * path at fire time, so nothing is recorded there, while the exit hooks stay
 * registered in case of a client-side navigation back to /.
 */
import { useEffect } from 'react';
import { installAnalytics } from '@/lib/analytics/install';

export default function AnalyticsProvider() {
  useEffect(() => {
    const reduced =
      typeof matchMedia === 'function'
        ? matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    installAnalytics(reduced);
  }, []);
  return null;
}
