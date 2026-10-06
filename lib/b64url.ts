/**
 * base64url (RFC 4648 §5), unpadded, over bytes. The one copy.
 *
 * Used by the admin session cookie (an email between `.` delimiters), the
 * Google ID token check (JWT segments), and the chat-turn signatures. Each
 * used to carry its own, which is two places to get a security encoding
 * subtly different.
 *
 * Hand-rolled rather than reached for, because `atob` wants standard base64
 * and base64url strips the padding. Feeding one to the other silently mangles
 * any segment whose length is not a multiple of four, which is most of them.
 *
 * Decoding is deliberately lenient (atob's own rules: `+/` pass, ASCII
 * whitespace is ignored, an impossible length throws). A caller that needs a
 * strict shape, as turn-sig.ts does for a 32-byte MAC, checks it first.
 *
 * WebCrypto-era globals only, no DOM: runs on the Worker and in bare Node.
 */

/** bytes -> base64url, no padding. */
export function bytesToB64url(bytes: ArrayBuffer | Uint8Array): string {
  let binary = '';
  for (const byte of bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * base64url -> bytes. Throws on input atob rejects.
 *
 * The `<ArrayBuffer>` argument is not decoration: `crypto.subtle.verify` wants
 * a BufferSource, and a bare `Uint8Array` widens to `ArrayBufferLike`, which
 * includes SharedArrayBuffer and so is not assignable.
 */
export function b64urlToBytes(segment: string): Uint8Array<ArrayBuffer> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
