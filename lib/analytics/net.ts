/**
 * Client address handling, and the decision not to store one.
 *
 * Lumen stored a raw `inet` because it had to answer "is one address
 * farming free kundalis" and "did these two accounts sign up from the same
 * place". Neither question exists here: there are no accounts and no free
 * resource to farm. Storing a visitor's IP would be a privacy liability with no
 * analytical payoff.
 *
 * So what is stored is a salted hash (for the rate-limit bucket and for
 * counting distinct visitors) plus a coarse `/24` or `/48` prefix. The prefix
 * is kept for exactly one reason: it is the only thing that makes it possible
 * to retro-fit an office CIDR to the internal list later. **The raw address
 * never reaches the database.**
 */

/**
 * Narrowest prefix an operator may declare internal.
 *
 * Not cosmetic. A `/0` in an env var would mark every visitor internal and
 * zero the whole panel, and the failure presents as "no traffic" rather than
 * as an error, so nobody would look for a typo. Ported straight from the
 * source system, which learned this the hard way.
 */
export const MIN_IPV4_PREFIX = 16;
export const MIN_IPV6_PREFIX = 32;

export interface ClientIp {
  ip: string | null;
  /** Raw x-forwarded-for chain, so a forged leftmost entry stays detectable. */
  chain: string | null;
}

/** Rejects obvious junk so a forged header cannot write garbage. */
function looksLikeIp(value: string): boolean {
  if (!value) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    return value.split('.').every((o) => Number(o) <= 255);
  }
  return /^[0-9a-fA-F:]+$/.test(value) && value.includes(':');
}

/**
 * The caller's address, from infrastructure headers only.
 *
 * A browser cannot read its own public IP and anything in a request body is
 * trivially forged, so this never looks at the body. Order is
 * most-trustworthy first: `cf-connecting-ip` and `x-real-ip` are set by the
 * proxy and overwrite whatever the client sent; `x-forwarded-for` is a chain
 * the client can prefix, so its leftmost entry is a hint, not a fact.
 */
export function clientIp(request: Request): ClientIp {
  const chain = request.headers.get('x-forwarded-for');
  const candidates = [
    request.headers.get('cf-connecting-ip'),
    request.headers.get('x-real-ip'),
    chain?.split(',')[0],
  ];

  for (const raw of candidates) {
    const value = raw?.trim();
    if (value && looksLikeIp(value)) return { ip: value, chain };
  }
  return { ip: null, chain };
}

/**
 * Salted SHA-256 of an address, hex.
 *
 * WebCrypto, so no `node:crypto` import. This has to run on a Worker. The
 * salt is required: an unsalted hash of the IPv4 space is trivially reversed
 * with a rainbow table, which would make this no better than storing the
 * address. `ingest.ts` refuses to write when the salt is unset and says why,
 * because degrading loudly beats degrading quietly here.
 */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Coarse network prefix: /24 for v4, /48 for v6. Null for anything odd. */
export function ipPrefix(ip: string): string | null {
  if (ip.includes(':')) {
    const groups = expandIpv6(ip);
    if (!groups) return null;
    return `${groups.slice(0, 3).join(':')}::/48`;
  }
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

/** Full eight-group form, so `::` cannot make two addresses look different. */
export function expandIpv6(ip: string): string[] | null {
  const [head, tail] = ip.split('::');
  const left = head ? head.split(':').filter(Boolean) : [];
  const right = tail ? tail.split(':').filter(Boolean) : [];
  if (ip.includes('::')) {
    const fill = 8 - left.length - right.length;
    if (fill < 0) return null;
    return [...left, ...Array(fill).fill('0'), ...right].map(pad);
  }
  const groups = ip.split(':');
  return groups.length === 8 ? groups.map(pad) : null;
}

function pad(group: string): string {
  return group.toLowerCase().padStart(4, '0');
}

export interface Cidr {
  /** Big-endian bit string of the network portion. */
  bits: string;
  v6: boolean;
  raw: string;
}

/**
 * Parse an env CIDR list, skipping anything unsafe.
 *
 * An over-broad or malformed entry is **skipped with a warning, not applied**.
 * Applying it is how a whole panel silently reads as zero.
 */
export function parseCidrList(raw: string | undefined): Cidr[] {
  if (!raw) return [];
  const out: Cidr[] = [];

  for (const entry of raw.split(',')) {
    const value = entry.trim();
    if (!value) continue;

    const [addr, prefixText] = value.split('/');
    const prefix = Number(prefixText);
    if (!addr || !Number.isInteger(prefix) || prefix < 0) {
      console.warn(`[analytics] skipping malformed CIDR: ${value}`);
      continue;
    }

    const v6 = addr.includes(':');
    const min = v6 ? MIN_IPV6_PREFIX : MIN_IPV4_PREFIX;
    if (prefix < min) {
      console.warn(
        `[analytics] skipping CIDR broader than /${min}: ${value}, ` +
          'it would mark every visitor internal',
      );
      continue;
    }

    const bits = toBits(addr, v6);
    if (bits === null || prefix > bits.length) {
      console.warn(`[analytics] skipping unparseable CIDR: ${value}`);
      continue;
    }
    out.push({ bits: bits.slice(0, prefix), v6, raw: value });
  }

  return out;
}

function toBits(addr: string, v6: boolean): string | null {
  if (v6) {
    const groups = expandIpv6(addr);
    if (!groups) return null;
    return groups
      .map((g) => parseInt(g, 16).toString(2).padStart(16, '0'))
      .join('');
  }
  const parts = addr.split('.');
  if (parts.length !== 4) return null;
  if (parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null;
  return parts.map((p) => Number(p).toString(2).padStart(8, '0')).join('');
}

export function matchesAnyCidr(ip: string, list: readonly Cidr[]): boolean {
  if (list.length === 0) return false;
  const v6 = ip.includes(':');
  const bits = toBits(ip, v6);
  if (bits === null) return false;
  return list.some(
    (cidr) => cidr.v6 === v6 && bits.startsWith(cidr.bits),
  );
}
