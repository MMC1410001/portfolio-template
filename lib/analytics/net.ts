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
  return value.includes(':') && expandIpv6(value) !== null;
}

/**
 * Whether a proxy we trust overwrites `x-real-ip` and `x-forwarded-for`.
 *
 * Opt-in, like TRUST_PLATFORM_AUTH_HEADER in admin-auth.ts, and for the same
 * reason: nothing inside a Worker can tell a header its ingress set from one
 * the client typed. Cloudflare sets `cf-connecting-ip` itself and replaces any
 * inbound copy, so on a Worker that header is a fact and the other two are
 * whatever the caller chose.
 */
function forwardedForTrusted(): boolean {
  const flag = process.env.TRUST_FORWARDED_FOR?.trim().toLowerCase();
  return flag === '1' || flag === 'true';
}

/**
 * Whether the Workers runtime handed us this request: it carries `request.cf`.
 * Read with Reflect.get, the way vinext reads it, and guarded, because vinext
 * makes it a getter that throws during static generation.
 */
function fromEdge(request: Request): boolean {
  try {
    const cf: unknown = Reflect.get(request, 'cf');
    return typeof cf === 'object' && cf !== null;
  } catch {
    return false;
  }
}

/**
 * The caller's address, from infrastructure headers only.
 *
 * A browser cannot read its own public IP and anything in a request body is
 * trivially forged, so this never looks at the body. By default only
 * `cf-connecting-ip` counts. This used to fall back to `x-real-ip` and the
 * leftmost `x-forwarded-for` entry, and on a host that does not set
 * `cf-connecting-ip` both are client-controlled: one typed header chose the
 * rate-limit bucket, the daily chat allowance, the trusted-network exemption
 * and the internal mark. TRUST_FORWARDED_FOR=1 brings them back, for a proxy
 * that overwrites them. With no trusted address the answer is null, which
 * every caller already treats as no budget, no write and no exemption.
 *
 * `cf-connecting-ip` itself is believed only on a request that came through
 * Cloudflare's edge, which is what overwrites it. The proof is `request.cf`:
 * the Workers runtime attaches it to every inbound request and no header can
 * create it, and vinext re-attaches it whenever it rebuilds the Request
 * (attachRequestCfMetadata in its request-pipeline). On any other host, the
 * same bundle under Node for one, the header is just text the caller typed.
 *
 * Local dev needs no exception: `vinext dev` (Miniflare) sets
 * `cf-connecting-ip` on every request, 127.0.0.1 from this machine, and
 * attaches `request.cf` too (checked through the admin `whoami` action,
 * which lists its keys). A unit test builds its Request by hand, so it has
 * to attach a `cf` object to stand in for the runtime.
 */
export function clientIp(request: Request): ClientIp {
  const chain = request.headers.get('x-forwarded-for');
  const candidates = [fromEdge(request) ? request.headers.get('cf-connecting-ip') : null];
  if (forwardedForTrusted()) {
    candidates.push(request.headers.get('x-real-ip'), chain?.split(',')[0] ?? null);
  }

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

/**
 * What a rate-limit bucket is keyed on: the /64 for IPv6, the address for v4.
 *
 * Budget keys only. The visitor hash stays on the full address.
 *
 * A /64 is the smallest network IPv6 hands out, and one household, phone or
 * cloud VM routinely holds the whole of it, 2^64 addresses, with privacy
 * extensions rotating through them on their own. Keyed on the full address,
 * the 120-events-a-minute budget was a per-request formality for anyone who
 * cared to rotate the low bits. IPv4 has no equivalent, and widening it to a
 * /24 would put a whole office or carrier NAT on one allowance.
 *
 * An address `expandIpv6` cannot read falls back to itself: the limit is then
 * no weaker than it was, which beats refusing the event.
 */
export function budgetKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  const groups = expandIpv6(ip);
  return groups ? `${groups.slice(0, 4).join(':')}::/64` : ip;
}

/**
 * `ANALYTICS_INTERNAL_VISITORS`, as a list of visitor ids.
 *
 * One parser for the two routes that read it: ingest classifies with it and
 * the dashboard reports how many are active, and the count on the panel is
 * only honest if it is a count of the list ingest actually matches against.
 */
export function internalVisitorIds(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
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

const HEX_GROUP = /^[0-9a-f]{1,4}$/i;

/**
 * Full eight-group form, so `::` cannot make two addresses look different.
 *
 * Strict: every group is one to four hex digits and `::` appears at most once
 * and stands for at least one group. The old reader dropped empty groups, so
 * `1:::2`, `:1:2:3:4:5:6:7` and `a::b::c` all parsed as something.
 */
export function expandIpv6(ip: string): string[] | null {
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const groupsOf = (part: string) => (part === '' ? [] : part.split(':'));
  const left = groupsOf(halves[0]);
  const right = halves.length === 2 ? groupsOf(halves[1]) : [];
  if (![...left, ...right].every((g) => HEX_GROUP.test(g))) return null;
  if (halves.length === 2) {
    const fill = 8 - left.length - right.length;
    if (fill < 1) return null;
    return [...left, ...Array<string>(fill).fill('0'), ...right].map(pad);
  }
  return left.length === 8 ? left.map(pad) : null;
}

function pad(group: string): string {
  return group.toLowerCase().padStart(4, '0');
}

export interface Cidr {
  /** Big-endian bit string of the network portion. */
  bits: string;
  v6: boolean;
  /** Canonical network form, see canonicalCidr. */
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

    const parts = value.split('/');
    if (parts.length !== 2 || !parts[0] || !/^\d{1,3}$/.test(parts[1])) {
      console.warn(`[analytics] skipping malformed CIDR: ${value}`);
      continue;
    }
    const [addr, prefixText] = parts;
    const prefix = Number(prefixText);

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
    const network = bits.slice(0, prefix);
    out.push({ bits: network, v6, raw: formatNetwork(network, v6) });
  }

  return out;
}

/**
 * One CIDR in canonical network form, or null when malformed or broader than
 * `/min4` (IPv4) or `/min6` (IPv6).
 *
 * Canonical means host bits masked off and IPv6 compressed and lowercase
 * (RFC 5952), so `203.0.113.7/24` is stored as `203.0.113.0/24` and
 * `2001:DB8:0:0::/48` and `2001:db8::/48` are one entry, not two.
 */
export function canonicalCidr(
  value: string,
  min4: number = MIN_IPV4_PREFIX,
  min6: number = MIN_IPV6_PREFIX,
): string | null {
  const parts = value.trim().split('/');
  if (parts.length !== 2 || !parts[0] || !/^\d{1,3}$/.test(parts[1])) return null;
  const v6 = parts[0].includes(':');
  const prefix = Number(parts[1]);
  const bits = toBits(parts[0], v6);
  if (bits === null || prefix > bits.length || prefix < (v6 ? min6 : min4)) return null;
  return formatNetwork(bits.slice(0, prefix), v6);
}

/**
 * The network one address stands for: its /64 for IPv6, the address itself
 * (/32) for IPv4, canonical. The same widening as budgetKey, for the same
 * reason: a single IPv6 address rotates within its /64 on its own, so a /128
 * trusted today is a stranger tomorrow.
 */
export function hostNetwork(ip: string): string | null {
  return canonicalCidr(`${ip}/${ip.includes(':') ? 64 : 32}`);
}

/** `network/prefix`, from the network bits, with the host bits zeroed. */
function formatNetwork(network: string, v6: boolean): string {
  const full = network.padEnd(v6 ? 128 : 32, '0');
  if (!v6) {
    const octets = [0, 8, 16, 24].map((i) => parseInt(full.slice(i, i + 8), 2));
    return `${octets.join('.')}/${network.length}`;
  }
  const groups = Array.from({ length: 8 }, (_, i) =>
    parseInt(full.slice(i * 16, i * 16 + 16), 2).toString(16),
  );
  return `${compressIpv6(groups)}/${network.length}`;
}

/** RFC 5952: the longest run of two or more zero groups becomes `::`, the first on a tie. */
function compressIpv6(groups: string[]): string {
  let best = -1;
  let bestLen = 1;
  let run = -1;
  for (let i = 0; i <= groups.length; i += 1) {
    if (i < groups.length && groups[i] === '0') {
      if (run < 0) run = i;
      continue;
    }
    if (run >= 0 && i - run > bestLen) {
      best = run;
      bestLen = i - run;
    }
    run = -1;
  }
  if (best < 0) return groups.join(':');
  return `${groups.slice(0, best).join(':')}::${groups.slice(best + bestLen).join(':')}`;
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
