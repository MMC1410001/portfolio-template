/**
 * Token -> cookie exchange, so a browser can hold an admin session.
 *
 * Kept in its own route rather than folded into the action switch on purpose:
 * folding it in would require the gate to whitelist an action *before*
 * authorising, and that special case is precisely how gates leak.
 *
 * ── Why Path=/ and not Path=/api/admin ────────────────────────────────────
 * A narrower path was the first instinct and it is wrong: the cookie has to
 * reach BOTH the /admin page (whose gate runs server-side, before any markup)
 * and /api/admin/* (the data calls). One cookie cannot name two paths, and
 * scoping it to the API meant /admin itself never saw it, the page fell
 * through to the sign-in form no matter how many times you signed in.
 *
 * The cost of Path=/ is that the cookie rides along on same-site requests it
 * is not needed for, including the ingest beacon. That is a few bytes and no
 * exposure: it is HttpOnly so no script can read it, Secure so it never
 * crosses plain HTTP, SameSite=Strict so it is not sent cross-site at all,
 * and no route other than the admin gate looks at it.
 */

import {
  ADMIN_COOKIE,
  MIN_TOKEN_LEN,
  SESSION_TTL_MS,
  googleClientId,
  isAllowedEmail,
  issueSession,
  notFound,
  timingSafeEqual,
} from '@/lib/analytics/admin-auth';
import { verifyGoogleIdToken } from '@/lib/analytics/google-auth';

export const dynamic = 'force-dynamic';

/**
 * Kept in step with the signed expiry, not set alongside it.
 *
 * Max-Age only asks the browser to forget the cookie. The deadline that is
 * actually enforced is the one inside the signature, which the gate checks on
 * every request, so these two must describe the same moment or a browser
 * would keep sending a value the server has already stopped accepting.
 */
const MAX_AGE = Math.floor(SESSION_TTL_MS / 1000);

/**
 * Two ways in, one session out.
 *
 * `{ token }` is the original: the master credential, compared in constant
 * time. `{ credential }` is a Google ID token, verified against Google's
 * signing keys and then checked against ADMIN_EMAILS.
 *
 * Both mint the *same* cookie, which is the point, every reader downstream
 * (the page, the analytics API) keeps one notion of "signed in" and does not
 * learn a second authentication scheme. ADMIN_TOKEN is still what signs the
 * session either way, so it remains the one rotation that revokes everything.
 */
export async function POST(request: Request) {
  const secret = process.env.ADMIN_TOKEN;
  // No token configured, or a weak one, is indistinguishable from no route.
  if (!secret || secret.length < MIN_TOKEN_LEN) return notFound();

  let token = '';
  let credential = '';
  try {
    const body = (await request.json()) as {
      token?: unknown;
      credential?: unknown;
    };
    token = typeof body.token === 'string' ? body.token : '';
    credential = typeof body.credential === 'string' ? body.credential : '';
  } catch {
    return notFound();
  }

  let session: string;

  if (credential) {
    const clientId = googleClientId();
    if (!clientId) {
      console.warn('[admin] google sign-in attempted but GOOGLE_CLIENT_ID is unset');
      return notFound();
    }

    const result = await verifyGoogleIdToken(credential, clientId);
    if (!result.ok) {
      // Logged, because every one of these is silent to the caller by design
      // and there is otherwise nothing to debug from. Reasons only, never the
      // token.
      console.warn(`[admin] google sign-in refused: ${result.reason}`);
      return notFound();
    }

    if (!isAllowedEmail(result.identity.email)) {
      // The one failure worth naming. Reaching this line requires a signature
      // Google actually produced, for OUR client id, so it cannot be probed
      // by a stranger, and "you signed in fine but you are not on the list"
      // is the difference between a two-minute fix and an afternoon spent
      // suspecting the token verifier.
      console.warn(`[admin] google sign-in not allowlisted: ${result.identity.email}`);
      return new Response(JSON.stringify({ error: 'not_allowed' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, no-store',
        },
      });
    }

    session = await issueSession(secret, Date.now(), result.identity.email);
  } else {
    if (!token || !timingSafeEqual(token, secret)) return notFound();
    // The cookie carries a signed session, never ADMIN_TOKEN itself. See the
    // note in admin-auth.ts on what that bought.
    session = await issueSession(secret);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
      'Set-Cookie':
        `${ADMIN_COOKIE}=${encodeURIComponent(session)}; Path=/; ` +
        `HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`,
    },
  });
}

/** Sign out: expire the cookie. */
export async function DELETE() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
      'Set-Cookie':
        `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; ` +
        'SameSite=Strict; Max-Age=0',
    },
  });
}
