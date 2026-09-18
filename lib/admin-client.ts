/**
 * The browser's side of the admin read API.
 *
 * One contract, and the important half of it is the failure behaviour:
 * **never return a zeroed payload on failure.** An empty funnel and a broken
 * endpoint look identical on screen, and only one of them means nobody
 * visited. So this throws, and each panel renders its own error state.
 */

export type AdminAction =
  | 'analytics'
  | 'audience'
  | 'campaigns'
  | 'chat'
  | 'click-map'
  | 'sessions'
  | 'whoami'
  | 'retention-sweep';

export class AdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AdminError';
  }
}

export async function fetchAdmin<T>(
  action: AdminAction,
  params: Record<string, string | number | boolean | null> = {},
): Promise<T> {
  const response = await fetch('/api/admin/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });

  if (!response.ok) {
    // 404 is what an unauthorised caller gets, deliberately indistinguishable
    // from a missing route, so say something useful rather than "not found".
    if (response.status === 404) {
      throw new AdminError('Not signed in, or not on the allowlist.', 404);
    }
    let detail = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error === 'storage_not_configured') {
        detail =
          'No database is configured. Set "d1" in .openai/hosting.json and ' +
          'redeploy.';
      } else if (body.error) {
        detail = body.error;
      }
    } catch {
      /* a non-JSON body is fine; the status is the message */
    }
    throw new AdminError(detail, response.status);
  }

  return (await response.json()) as T;
}

/** Exchange the admin token for a cookie, so a browser session persists. */
export async function signIn(token: string): Promise<boolean> {
  const response = await fetch('/api/admin/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return response.ok;
}

/**
 * Exchange a Google ID token for the same cookie.
 *
 * The credential never goes anywhere but our own origin: Google's script hands
 * it to the browser, the browser hands it here, and the Worker verifies the
 * signature itself. There is no third party in the exchange and no client
 * secret for one to need.
 */
export type GoogleSignInOutcome = 'ok' | 'not-allowed' | 'rejected';

export async function signInWithGoogle(
  credential: string,
): Promise<GoogleSignInOutcome> {
  const response = await fetch('/api/admin/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  if (response.ok) return 'ok';
  // 403 is the only status the route uses to mean "Google vouched for you,
  // but you are not on the list". Everything else is the deliberate 404, and
  // must not be reported as an allowlist problem -- doing so is what sent us
  // auditing ADMIN_EMAILS while the real fault was elsewhere.
  return response.status === 403 ? 'not-allowed' : 'rejected';
}

/**
 * End the session.
 *
 * Returns whether the server actually expired the cookie. `fetch` rejects only
 * on a network failure, so without the `ok` check a 502 from a down Worker
 * would resolve happily and the caller would reload straight back into the
 * dashboard, the one outcome a sign-out button must never produce quietly.
 */
export async function signOut(): Promise<boolean> {
  const response = await fetch('/api/admin/session', { method: 'DELETE' });
  return response.ok;
}
