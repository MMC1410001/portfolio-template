'use client';
/**
 * Sign out.
 *
 * `signOut()` has existed in `lib/admin-client.ts` since the cookie was
 * introduced and was never called from anywhere, the only way to end a
 * session was to wait out its 12 hours or clear site data. This is the button
 * that was missing.
 *
 * ── Reload rather than route ───────────────────────────────────────────────
 * `location.reload()`, not a client navigation: /admin is a server component
 * that runs `authorizeAdmin` before rendering, and only a fresh document
 * request re-runs it. A client-side navigation would re-render the dashboard
 * from cached RSC payload and look like the sign-out silently failed.
 *
 * ── Why the DELETE has to land first ───────────────────────────────────────
 * The cookie is HttpOnly, so the browser cannot clear it, the server has to
 * send back an expired Set-Cookie. Reloading before that response arrives
 * would reload with the session still intact. Hence the await, and hence the
 * button reporting an error rather than pretending: a sign-out that appears
 * to work while leaving a live session in the jar is the one failure mode
 * worth being loud about.
 */
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/admin-client';

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      aria-label="Sign out"
      title={failed ? 'Sign out failed. Try again' : 'Sign out'}
      onClick={() => {
        if (busy) return;
        setBusy(true);
        setFailed(false);
        signOut().then(
          (ok) => {
            if (ok) location.reload();
            else {
              setBusy(false);
              setFailed(true);
            }
          },
          () => {
            setBusy(false);
            setFailed(true);
          },
        );
      }}
    >
      <LogOut className="size-3.5" />
      <span className="hidden sm:inline">
        {failed ? 'Retry' : busy ? 'Signing out…' : 'Sign out'}
      </span>
    </Button>
  );
}
