/**
 * Google Sign-In, verified properly.
 *
 * ── Why this exists next to a perfectly good token ─────────────────────────
 * ADMIN_EMAILS has been in this codebase since the start and has never gated
 * anything on Cloudflare. It only ever applied alongside the platform header
 * (`oai-authenticated-user-email`), and that header is trustworthy only where
 * an ingress strips inbound copies, which a Worker does not. So the allowlist
 * sat there looking like a gate while ADMIN_TOKEN did all the work.
 *
 * The fix is not a better header. It is an assertion that carries its own
 * proof: a Google ID token is a JWT signed by Google's private key, so the
 * claim "this request is from alex@…" survives being repeated by a stranger.
 * Knowing the email buys nothing, and that matters here specifically, because
 * `content/portfolio.ts` prints the owner's address on the homepage. Under the
 * header scheme that published the allowlist secret. Under this one it
 * publishes a username, which is what an email is.
 *
 * ── What is actually checked ───────────────────────────────────────────────
 * All of it, in the order that fails cheapest first:
 *   1. shape, three segments, and `alg: RS256` in the header. An `alg: none`
 *      token is the oldest JWT trick there is, and the only defence is to
 *      refuse to read the algorithm the attacker chose.
 *   2. signature, RSASSA-PKCS1-v1_5 / SHA-256 against the JWKS key with the
 *      matching `kid`. Nothing below this line is read until this passes,
 *      because until it passes the payload is attacker-authored text.
 *   3. `iss`: one of Google's two spellings.
 *   4. `aud`: our own client id. THIS is the one that is easy to skip and
 *      fatal to skip: without it, an ID token minted for any *other* Google
 *      application, by any developer, verifies perfectly and names a real
 *      Google user. `aud` is what makes the token ours rather than merely
 *      Google's.
 *   5. `exp` / `iat`: with 60s of skew, because the clock in a Worker is not
 *      the clock in a browser.
 *   6. `email_verified`: an unverified email on a Google account is a string
 *      the user typed, so treating it as identity would let anyone claim any
 *      address.
 *
 * The allowlist check is NOT here. This module answers "who is this, provably"
 * and `admin-auth.ts` answers "are they allowed", separating them keeps the
 * question of identity away from the question of authority, and means a test
 * can exercise one without standing up the other.
 *
 * ── No library ─────────────────────────────────────────────────────────────
 * WebCrypto verifies RS256 directly and is already imported here for the
 * session HMAC. A JWT dependency would add a supply-chain surface to the one
 * file in the repo where that matters most.
 */

/** Google's published signing keys. Rotated by Google, hence the cache TTL. */
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/** Both spellings appear in real Google tokens. Both are legitimate. */
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/** Tolerance for clock drift between Google, the Worker and the browser. */
const SKEW_MS = 60_000;

/** How long a fetched key set is reused before being refetched. */
const JWKS_TTL_MS = 3_600_000;

interface GoogleJwk {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

interface JwtHeader {
  alg?: unknown;
  kid?: unknown;
}

interface JwtPayload {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  iat?: unknown;
  email?: unknown;
  email_verified?: unknown;
  hd?: unknown;
}

let cache: { keys: GoogleJwk[]; fetchedAt: number } | null = null;

/**
 * base64url -> bytes.
 *
 * Hand-rolled rather than reached for, because `atob` wants standard base64
 * and JWT segments are base64**url** with the padding stripped. Feeding one to
 * the other silently mangles any segment whose length is not a multiple of
 * four, which is most of them.
 */
// The `<ArrayBuffer>` argument is not decoration: `crypto.subtle.verify` wants
// a BufferSource, and a bare `Uint8Array` widens to `ArrayBufferLike`, which
// includes SharedArrayBuffer and so is not assignable.
function b64urlToBytes(segment: string): Uint8Array<ArrayBuffer> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function b64urlToJson<T>(segment: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(segment))) as T;
  } catch {
    return null;
  }
}

/**
 * Fetch Google's keys, with one forced refresh available.
 *
 * `force` exists for key rotation: a token signed with a brand new `kid` is
 * indistinguishable from a forged one if all we have is a stale cache. One
 * refetch on an unknown kid turns a day of mysterious sign-in failures into a
 * single extra request.
 */
async function jwks(force = false, now: number = Date.now()) {
  if (!force && cache && now - cache.fetchedAt < JWKS_TTL_MS) return cache.keys;
  // Plain fetch, and it has to stay that way.
  //
  // This line read `fetch(JWKS_URL, { cf: { cacheTtl: 3600 } } as RequestInit)`
  // and that is what broke Google sign-in on the deployed Worker: every
  // attempt failed the signature check, on production and in `vinext dev`
  // alike, while every unit test passed because the tests stub fetch and never
  // execute this line. Removing the `cf` hint was the only functional change
  // between the broken deploy and the working one.
  //
  // The hint bought nothing anyway, Google sends its own cache headers and
  // the module-level cache above does the real work. Note the `as RequestInit`
  // cast it needed: TypeScript rejecting a property is worth listening to, and
  // casting past it is how a runtime failure gets written in a file that
  // compiles cleanly.
  const response = await fetch(JWKS_URL);
  if (!response.ok) throw new Error(`JWKS fetch failed (${response.status})`);
  const body = (await response.json()) as { keys?: GoogleJwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  cache = { keys, fetchedAt: now };
  return keys;
}

/** Exposed so a test can start from a known-empty cache. */
export function resetJwksCache(): void {
  cache = null;
}

/**
 * Find the signing key, refetching once for an unknown `kid`.
 *
 * Separated from the verify step so the two can fail *differently*. Folded
 * together, a WebCrypto error reported itself as a network error and sent us
 * looking at Google's availability when the fault was in the key import.
 */
async function findKey(kid: string): Promise<GoogleJwk | null> {
  const match = (keys: GoogleJwk[]) =>
    keys.find((k) => k.kid === kid && k.kty === 'RSA') ?? null;
  const first = match(await jwks());
  if (first) return first;
  // An unknown kid is the rotation case, not necessarily a forgery, refetch
  // once, then believe the answer.
  return match(await jwks(true));
}

async function verifyWithKey(jwk: GoogleJwk, token: string): Promise<boolean> {
  const dot = token.lastIndexOf('.');
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(token.slice(dot + 1)),
    new TextEncoder().encode(token.slice(0, dot)),
  );
}

const detail = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export interface GoogleIdentity {
  email: string;
  /** Google Workspace domain, when the account has one. Diagnostics only. */
  hd: string | null;
}

/**
 * Why a token was refused.
 *
 * Returned rather than logged, because the caller needs to distinguish exactly
 * one case from the rest: `not-allowed` is a real Google user who simply is
 * not on the list, and deserves to be told. Everything else is a token we
 * could not trust, and gets the same silent 404 an anonymous caller would.
 *
 * The first version of this returned plain `null` for all of them, and the
 * sign-in card reported every one as "that account is not on the allowlist" --
 * which sent us looking at ADMIN_EMAILS when the token never verified at all.
 */
export type GoogleFailure =
  | 'malformed'
  | 'bad-alg'
  | 'jwks-unavailable'
  | 'unknown-key'
  | 'crypto-failed'
  | 'bad-signature'
  | 'bad-issuer'
  | 'wrong-audience'
  | 'expired'
  | 'unverified-email';

export type GoogleResult =
  | { ok: true; identity: GoogleIdentity }
  | { ok: false; reason: GoogleFailure };

/**
 * Verify a Google ID token and return the identity it proves.
 *
 * Every failure names itself. The caller still collapses almost all of them
 * into one 404, the distinction exists so the *server log* can say which
 * check failed, and so a genuine-but-unlisted account can be told the truth.
 */
export async function verifyGoogleIdToken(
  token: string,
  clientId: string,
  now: number = Date.now(),
): Promise<GoogleResult> {
  const fail = (reason: GoogleFailure): GoogleResult => ({ ok: false, reason });

  if (!token || !clientId) return fail('malformed');

  const parts = token.split('.');
  if (parts.length !== 3) return fail('malformed');

  const header = b64urlToJson<JwtHeader>(parts[0]);
  // Only RS256. Read as "is it the algorithm we accept", never as "which
  // algorithm should we use", the latter is what `alg: none` exploits.
  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string') {
    return fail('bad-alg');
  }

  let jwk: GoogleJwk | null;
  try {
    jwk = await findKey(header.kid);
  } catch (error) {
    // Logged with the underlying message: "Google was unreachable" and
    // "Google answered 500" are the same reason code but very different days.
    console.warn(`[admin] JWKS fetch failed: ${detail(error)}`);
    return fail('jwks-unavailable');
  }
  if (!jwk) return fail('unknown-key');

  let signatureOk: boolean;
  try {
    signatureOk = await verifyWithKey(jwk, token);
  } catch (error) {
    console.warn(`[admin] signature check threw: ${detail(error)}`);
    return fail('crypto-failed');
  }
  if (!signatureOk) return fail('bad-signature');

  // Only now is the payload something Google said rather than something the
  // caller typed.
  const claims = b64urlToJson<JwtPayload>(parts[1]);
  if (!claims) return fail('malformed');

  if (typeof claims.iss !== 'string' || !ISSUERS.has(claims.iss)) {
    return fail('bad-issuer');
  }
  if (claims.aud !== clientId) return fail('wrong-audience');

  const exp = Number(claims.exp) * 1000;
  if (!Number.isFinite(exp) || exp + SKEW_MS <= now) return fail('expired');
  const iat = Number(claims.iat) * 1000;
  if (Number.isFinite(iat) && iat - SKEW_MS > now) return fail('expired');

  // `email_verified` arrives as a boolean from Google and as the string
  // "true" from some older clients. Both are accepted; anything else is not.
  const verified =
    claims.email_verified === true || claims.email_verified === 'true';
  if (!verified) return fail('unverified-email');

  const email =
    typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (!email) return fail('unverified-email');

  return {
    ok: true,
    identity: { email, hd: typeof claims.hd === 'string' ? claims.hd : null },
  };
}
