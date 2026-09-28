/**
 * The panel's own theme wrapper, and a firm instruction not to index it.
 *
 * `robots: noindex` is what keeps the route out of search results. In
 * production ADMIN_TOKEN is always set, so a stranger, crawler included, gets
 * a 200 and the sign-in form rather than a 404 (the 404 is only for a deploy
 * with no token configured, where there is nothing to sign in with). A 200 is
 * indexable, so this is the whole defence, not insurance. robots.txt
 * deliberately does not Disallow the path; see app/robots.ts for why.
 */
import type { Metadata } from 'next';
import { AdminTheme } from '@/components/admin/ThemeToggle';

export const metadata: Metadata = {
  title: 'Portfolio analytics',
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminTheme>{children}</AdminTheme>;
}
