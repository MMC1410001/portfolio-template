'use client';
/**
 * The sign-in card: Google first, token second.
 *
 * Only rendered when ADMIN_TOKEN is configured and the caller is not already
 * authorised. With no token set, /admin 404s instead. There is nothing to
 * type, and offering a form would advertise a door with no key.
 *
 * A wrong token still gets a 404 from the session route, so this deliberately
 * says nothing about whether the value was close.
 *
 * ── Why the token field stays ──────────────────────────────────────────────
 * Google sign-in has dependencies this app does not control: a third-party
 * script, a correct CSP, a client id that matches the origin, and Google being
 * up. Each is a way to be locked out of your own dashboard from the browser.
 * The token is the path with no dependencies at all, so it remains as the
 * break-glass: below the button, not beside it, because it should be the
 * second thing tried rather than the first.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GoogleSignIn } from '@/components/admin/GoogleSignIn';
import { signIn } from '@/lib/admin-client';

export function AdminSignIn({ clientId }: { clientId: string }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">Portfolio analytics</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {clientId ? (
            <>
              <GoogleSignIn clientId={clientId} />
              <div className="flex items-center gap-2">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  or
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          ) : null}
          <form
            className="flex flex-col gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!token.trim() || busy) return;
              setBusy(true);
              setFailed(false);
              const ok = await signIn(token.trim());
              setBusy(false);
              if (ok) location.reload();
              else setFailed(true);
            }}
          >
            <label htmlFor="admin-token" className="text-xs">
              Access token
            </label>
            <Input
              id="admin-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="current-password"
              placeholder="ADMIN_TOKEN"
            />
            {failed ? (
              <p className="text-xs text-destructive">
                That did not work.
              </p>
            ) : null}
            <Button type="submit" disabled={busy || !token.trim()}>
              {busy ? 'Checking…' : 'Continue'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
