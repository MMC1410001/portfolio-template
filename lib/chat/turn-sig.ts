/**
 * Signed assistant turns: the server vouches for the replies it wrote.
 *
 * ── Why ────────────────────────────────────────────────────────────────────
 * /api/chat is stateless, so the browser carries the conversation and sends
 * it back with each question. lib/chat/gate.ts screens the USER turns in that
 * history through the guards, but an assistant turn cannot be screened that
 * way: the guards judge questions, and the site's own replies contain
 * "password", "private" and "salary" in their refusals. So an assistant turn
 * was trusted as sent, and a hand-built request could put any sentence in the
 * bot's mouth ("Alex's salary is …, as I said") for the model to repeat
 * under the label "AI · grounded in portfolio".
 *
 * Now every reply leaves the server with `sig`, an HMAC of the text the
 * browser will send back, and an assistant turn without a valid one is
 * dropped before anything else looks at the history. The only assistant text
 * that reaches the model is text this server produced.
 *
 * ── What is signed ─────────────────────────────────────────────────────────
 * The first TURN_CHARS characters, because that is what Chat.tsx keeps: the
 * model needs the thread of the conversation, not a 1200-character answer in
 * every prompt. Client and server read the same constant from here.
 *
 * ── The key ────────────────────────────────────────────────────────────────
 * Derived from ANALYTICS_IP_SALT, which production already requires (the
 * preflight blocks a deploy without it), so there is no new secret to set.
 * Derived, not reused: HMAC(salt, label) is the signing key, so a signature
 * is never a hash the IP code could also produce. With no salt nothing can be
 * signed or verified, and every assistant turn is dropped: follow-ups keep
 * the visitor's own turns and lose the replies, a worse context, never a
 * forged one.
 *
 * Replies the panel answers locally (offline, rate limited, stopped) carry no
 * signature and are dropped the same way. A replayed signature can only
 * replay text this server wrote, so signatures are not bound to a session.
 *
 * WebCrypto only, no DOM: runs on the Worker and in `npm run test:units`.
 */

/** How much of a reply the browser keeps, and so how much is signed. */
export const TURN_CHARS = 320;

const LABEL = 'portfolio chat-turn key v1';
const encoder = new TextEncoder();

function b64url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(text)) return null; // 32 bytes, unpadded
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '=');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * One derived key per (secret, label) per isolate: importKey is not free. The
 * label is what keeps two uses of the salt apart, so a reply signature can
 * never pass as a quota id's, or the other way round.
 */
const keys = new Map<string, Promise<CryptoKey>>();

function signingKey(secret: string, label: string): Promise<CryptoKey> {
  const id = `${label}\n${secret}`;
  let key = keys.get(id);
  if (!key) {
    key = (async () => {
      const root = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const derived = await crypto.subtle.sign('HMAC', root, encoder.encode(label));
      return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    })();
    keys.set(id, key);
  }
  return key;
}

/** HMAC-SHA256 of `message` under the key derived for `label`, base64url. */
export async function signWith(label: string, message: string, secret: string): Promise<string> {
  const key = await signingKey(secret, label);
  return b64url(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

/** Constant-time, via WebCrypto's own verify. Malformed input is simply false. */
export async function verifyWith(label: string, message: string, sig: unknown, secret: string): Promise<boolean> {
  if (typeof sig !== 'string') return false;
  const bytes = fromB64url(sig);
  if (!bytes) return false;
  const key = await signingKey(secret, label);
  return crypto.subtle.verify('HMAC', key, bytes, encoder.encode(message));
}

/** The signature for a reply, over exactly what the browser will send back. */
export function signTurn(reply: string, secret: string): Promise<string> {
  return signWith(LABEL, reply.slice(0, TURN_CHARS), secret);
}

export async function verifyTurn(text: string, sig: unknown, secret: string): Promise<boolean> {
  if (text.length > TURN_CHARS) return false;
  return verifyWith(LABEL, text, sig, secret);
}

export interface IncomingTurn {
  role: 'user' | 'assistant';
  text: string;
  sig?: unknown;
}

/**
 * The history with every assistant turn this server cannot vouch for removed,
 * and the signatures stripped. User turns pass through untouched: they are
 * the visitor's own words, and gate.ts screens those.
 */
export async function verifyHistory(
  turns: IncomingTurn[],
  secret: string | undefined,
): Promise<{ role: 'user' | 'assistant'; text: string }[]> {
  const kept: { role: 'user' | 'assistant'; text: string }[] = [];
  for (const turn of turns) {
    if (turn.role === 'assistant' && !(secret && (await verifyTurn(turn.text, turn.sig, secret)))) continue;
    kept.push({ role: turn.role, text: turn.text });
  }
  return kept;
}
