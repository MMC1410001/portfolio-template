/**
 * The gate, and nothing else.
 *
 * A server component so the check happens before any panel markup exists.
 * It does NOT fetch analytics. See AdminShell for why the data is
 * client-fetched.
 *
 * ── notFound(), not redirect('/') ──────────────────────────────────────────
 * A redirect from an admin gate confirms the route exists, which is exactly
 * what a 404 is here to avoid. The API route answers the same way, so the two
 * cannot disagree about whether /admin is a thing.
 *
 * ── The gate runs twice, on purpose ────────────────────────────────────────
 * This page and /api/admin/analytics are separate requests, so both call
 * authorizeAdmin(). One implementation, two callers, they cannot drift.
 */
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { authorizeAdmin, googleClientId } from '@/lib/analytics/admin-auth';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminSignIn } from '@/components/admin/AdminSignIn';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const incoming = await headers();
  // authorizeAdmin takes a Request; wrap the headers we were handed rather
  // than duplicating the logic for a second shape.
  const identity = await authorizeAdmin(
    new Request('https://local/admin', { headers: incoming }),
  );

  if (!identity) {
    // With no ADMIN_TOKEN configured there is nothing to type, so the route
    // simply does not exist. With one, offer the exchange, a wrong token
    // still 404s from the session route.
    if (!process.env.ADMIN_TOKEN) notFound();
    // Read on the server and passed down: NEXT_PUBLIC_* is inlined at build
    // time, so a client component reading it directly would bake in whatever
    // the build machine had rather than what the Worker is running with.
    return <AdminSignIn clientId={googleClientId()} />;
  }

  return <AdminShell who={identity.who} />;
}
