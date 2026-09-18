/**
 * The panel's own theme wrapper, and a firm instruction not to index it.
 *
 * `robots: noindex` matters because the route answers 404 to strangers rather
 * than 401, which means a crawler that finds the URL gets a 404 and nothing
 * else, but the metadata is free insurance.
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
