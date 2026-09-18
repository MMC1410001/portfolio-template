/**
 * The /admin gate. One implementation, three callers.
 *
 * The page, the read API and the session route all call this. Lumen's
 * single gated edge function is the reason none of its 28 actions shipped
 * ungated; with a gate per route, a gate is N chances to forget, and on a
 * public portfolio the failure mode is "visitor analytics readable by anyone".
 *
 * ── Two mechanisms, and which one is trusted where ─────────────────────────
 * Primary (opt-in): the platform-injected `oai-authenticated-user-email`
 * header, honoured ONLY when `TRUST_PLATFORM_AUTH_HEADER` is set.
 *
 * That gate is not defensive dressing. A request header is trustworthy only if
 * something in front of the app removes any inbound copy, and **that is a
 * property of the host, not of this code**. On OpenAI Sites the ingress does
 * it. On a plain Cloudflare Worker, or any origin reachable directly, 
 * nothing does, and the header is whatever the caller typed.
 *
 * The original comment here claimed the check was safe because
 * `@openai/sites-vite-plugin` strips inbound `oai-authenticated-user-*`. It
 * does, but only in `configureServer`: the **dev-server middleware**. There
 * is no equivalent in the production Worker bundle.
 *
 * It also claimed allowlist membership would hold "if a production ingress
 * ever fails to strip". It does not. `content/portfolio.ts` prints the owner's
 * email in the contact section, and that address is in `ADMIN_EMAILS`: so the
 * allowlist secret is published on the homepage. Verified by serving the built
 * Worker with ADMIN_EMAILS set and sending the header by hand: it returned the
 * full dashboard, `{"via":"platform"}`, HTTP 200.
 *
 * So the default is now off. Set `TRUST_PLATFORM_AUTH_HEADER=1` only where a
 * trusted ingress really does strip the header.
 *
 * Fallback, and the only path that works by default: ADMIN_TOKEN, as a Bearer
 * header (curl, tests) or the `pa_admin` cookie (a browser session). A secret
 * compared in constant time needs nothing in front of it to be safe, which is
 * why it is the one that survives a change of host.
 *
 * ── The cookie is a signed session, not the token ──────────────────────────
 * It used to be `pa_admin=<ADMIN_TOKEN>`: the master credential itself, sat
 * in the browser jar. HttpOnly kept scripts off it, but three things followed
 * that nothing could fix from the browser side: it could not be revoked
 * without rotating the env var and breaking the CI retention cron with it, the
 * `Max-Age` was advisory so the server would honour a "12 hour" cookie
 * indefinitely, and anything that ever read the jar got the key to everything
 * rather than one session.
 *
 * So the cookie now carries `<expires-at>.<hmac>`, signed with ADMIN_TOKEN
 * over its own expiry. The server re-derives the signature and checks the
 * clock, which makes the deadline real; rotating ADMIN_TOKEN invalidates every
 * outstanding session in one move; and the value in the jar is worth exactly
 * one session that expires on its own.
 *
 * Bearer stays a direct compare against the secret. That path is curl, the
 * tests and the GitHub Actions retention cron, callers that hold the real
 * credential deliberately and have nowhere to keep a session.
 *
 * ── Failure is 404, not 401 ────────────────────────────────────────────────
 * A 401 on a public portfolio advertises that an admin API exists and invites
 * a token grind. No WWW-Authenticate, and no distinction between "no
 * credential" and "wrong credential". Lumen could afford real status codes
 * because it sat behind an authenticated app; this does not.
 */

export type AdminIdentity =
  | { via: 'platform'; who: string }
  | { via: 'google'; who: string }
  | { via: 'token'; who: 'token' };

export const ADMIN_COOKIE = 'pa_admin';
/** Shorter than this is refused outright rather than gating on a weak secret. */
export const MIN_TOKEN_LEN = 32;
/** How long an issued browser session stays valid. */
export const SESSION_TTL_MS = 43_200_000; // 12 hours

/**
 * Version prefix inside the signed message.
 *
 * Not decoration: it is what stops a future change to the payload's shape from
 * accepting an old cookie under new rules.
 */
const SESSION_V = 'v1';

/**
 * Version 2 carries the signed-in email inside the signature.
 *
 * A session used to mean only "someone knew the token", so `who` was the
 * literal string 'token'. With Google sign-in there is a real identity worth
 * showing in the header, and it has to be *inside* the signed message rather
 * than beside it, an email the server re-reads from an unsigned part of the
 * cookie is an email the holder can rewrite.
 *
 * v1 is still verified. It is what the token form issues, and refusing it here
 * would log out a live session on deploy for no security gain: the two
 * versions differ in what they carry, not in how strongly they are signed.
 */
const SESSION_V2 = 'v2';

function allowlist(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Whether an email is on the allowlist. Empty allowlist admits nobody. */
export function isAllowedEmail(email: string): boolean {
  return allowlist().has(email.trim().toLowerCase());
}

/**
 * The Google OAuth client id, or '' when Google sign-in is not configured.
 *
 * Not a secret. It is handed to the browser and shown to every visitor of
 * /admin. It identifies the application; what makes a token ours is that
 * Google signed it *with this `aud`*, which knowing the value does not help
 * anyone reproduce.
 *
 * ── Deliberately NOT named NEXT_PUBLIC_* ───────────────────────────────────
 * That prefix would be the obvious choice for a value the browser sees, and it
 * is the wrong one: NEXT_PUBLIC_* is **inlined at build time**, in the server
 * bundle too. Verified by building with it unset and grepping
 * `dist/server/index.js`: the identifier is gone, replaced by `""`. A runtime
 * var on the Worker would then never be read, the button would never render,
 * and the only clue would be that setting the variable changed nothing.
 *
 * The value reaches the browser as a prop from a server component instead, so
 * the client bundle never needs it and this stays a genuine runtime read.
 */
export function googleClientId(): string {
  return (process.env.GOOGLE_CLIENT_ID ?? '').trim();
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key !== name) continue;
    const raw = rest.join('=');
    if (!raw) return null;
    // Decoded, because the session route writes it with
    // encodeURIComponent. Without this, a token containing any character
    // that gets percent-encoded would never match and the failure would be
    // silent, the sign-in form would simply reappear.
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

/**
 * Constant-time compare over UTF-8 bytes.
 *
 * Hand-rolled because `node:crypto` is not available here. Length is compared
 * first (that leaks only the length, which is not the secret) then the bytes
 * are XOR-folded so the loop cannot exit early on the first mismatch.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * base64url, so an email can sit in a cookie without colliding with the `.`
 * that separates the fields. Standard base64 would survive the delimiter but
 * not a URL; both the `+/` and the padding are avoided here rather than
 * depended on to round-trip through encodeURIComponent.
 */
function b64url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Mint a cookie value for a browser session. Signed over its own expiry.
 *
 * With `who`, the email is signed alongside the expiry and the value is a v2
 * session; without, it is the v1 shape the token form has always issued.
 */
export async function issueSession(
  secret: string,
  now: number = Date.now(),
  who?: string,
): Promise<string> {
  const expires = now + SESSION_TTL_MS;
  if (!who) {
    return `${expires}.${await hmacHex(secret, `${SESSION_V}:${expires}`)}`;
  }
  const email = who.trim().toLowerCase();
  const sig = await hmacHex(secret, `${SESSION_V2}:${expires}:${email}`);
  return `${expires}.${b64url(email)}.${sig}`;
}

/**
 * Read a cookie value, returning the identity it carries.
 *
 * The clock is checked BEFORE the signature is computed, an expired value is
 * not worth an HMAC, and the expiry is not a secret so there is nothing to
 * leak by returning early on it. The signature compare itself stays constant
 * time.
 *
 * The email is decoded before verification but used only after: it is an
 * *input* to the message being signed, so a tampered address simply produces a
 * signature that does not match. There is no path where an unverified address
 * is returned.
 */
export async function readSession(
  value: string,
  secret: string,
  now: number = Date.now(),
): Promise<{ who: string } | null> {
  const parts = value.split('.');
  if (parts.length !== 2 && parts.length !== 3) return null;

  const expires = Number(parts[0]);
  if (!Number.isFinite(expires) || expires <= now) return null;

  if (parts.length === 2) {
    const expected = await hmacHex(secret, `${SESSION_V}:${expires}`);
    return timingSafeEqual(parts[1], expected) ? { who: 'token' } : null;
  }

  let email = '';
  try {
    email = unb64url(parts[1]);
  } catch {
    return null;
  }
  if (!email) return null;
  const expected = await hmacHex(secret, `${SESSION_V2}:${expires}:${email}`);
  return timingSafeEqual(parts[2], expected) ? { who: email } : null;
}

/** Whether a cookie value is a valid session. */
export async function verifySession(
  value: string,
  secret: string,
  now: number = Date.now(),
): Promise<boolean> {
  return (await readSession(value, secret, now)) !== null;
}

/**
 * Whether a front door we trust is stripping inbound copies of the header.
 *
 * Opt-in, and deliberately not inferred. There is no signal inside a Worker
 * that distinguishes "my ingress injected this" from "the client sent it", so
 * guessing would mean guessing wrong in the direction that grants access.
 */
function platformHeaderTrusted(): boolean {
  const flag = process.env.TRUST_PLATFORM_AUTH_HEADER?.trim().toLowerCase();
  return flag === '1' || flag === 'true';
}

let warnedInertAllowlist = false;

export async function authorizeAdmin(
  request: Request,
): Promise<AdminIdentity | null> {
  const email = request.headers
    .get('oai-authenticated-user-email')
    ?.trim()
    .toLowerCase();

  if (platformHeaderTrusted()) {
    if (email && allowlist().has(email)) return { via: 'platform', who: email };
  } else if (
    allowlist().size > 0 &&
    !googleClientId() &&
    !warnedInertAllowlist
  ) {
    // Said once, because ADMIN_EMAILS looking configured while doing nothing
    // is exactly how someone concludes the panel is protected by it. Google
    // sign-in gives the allowlist teeth, so the warning is silent once a
    // client id is set.
    warnedInertAllowlist = true;
    console.warn(
      '[admin] ADMIN_EMAILS is set but neither TRUST_PLATFORM_AUTH_HEADER nor ' +
        'GOOGLE_CLIENT_ID is, so the email allowlist is inert and ' +
        'ADMIN_TOKEN is the only way in. That is the correct default anywhere ' +
        'the host does not strip inbound oai-authenticated-user-* headers.',
    );
  }

  const secret = process.env.ADMIN_TOKEN;
  if (secret && secret.length >= MIN_TOKEN_LEN) {
    // Bearer: the real credential, held deliberately by curl, the tests and
    // the retention cron.
    const bearer = request.headers
      .get('authorization')
      ?.replace(/^Bearer\s+/i, '');
    if (bearer && timingSafeEqual(bearer, secret)) {
      return { via: 'token', who: 'token' };
    }

    // Cookie: a signed session with a deadline the server actually enforces.
    const cookie = readCookie(request, ADMIN_COOKIE);
    const session = cookie ? await readSession(cookie, secret) : null;
    if (session) {
      if (session.who === 'token') return { via: 'token', who: 'token' };
      // The allowlist is re-read on every request rather than trusted from
      // issue time, so removing an address from ADMIN_EMAILS ends that
      // person's live session instead of waiting out its 12 hours.
      if (!allowlist().has(session.who)) return null;
      return { via: 'google', who: session.who };
    }
  }
  return null;
}

/** What an unauthorised caller gets. Deliberately indistinguishable from 404. */
export function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
