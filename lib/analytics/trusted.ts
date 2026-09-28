/**
 * Trusted networks: the owner's own connections, one list for two jobs.
 *
 *   analytics  a session from a trusted network is recorded as internal, so
 *              "Real visitors" leaves it out (app/api/track/route.ts).
 *   chat       a question from one is held to neither chat limit, the
 *              per-minute rate or the daily allowance (chat-quota.ts).
 *
 * ── Where the list comes from ──────────────────────────────────────────────
 * Two sources, merged:
 *
 *   panel  rows in `trusted_networks`, added and removed from /admin by a
 *          signed-in admin. This is the one to use.
 *   env    ANALYTICS_INTERNAL_CIDRS and CHAT_UNLIMITED_CIDRS, as before. A
 *          fixed floor: shown in the panel, but only removable by editing the
 *          Worker's settings. Kept so a deploy with an empty database, or one
 *          where the panel is unreachable, still knows the owner.
 *
 * ── Why a cache, and why 30 seconds ────────────────────────────────────────
 * The list is read on every ingest and every chat question, and it changes a
 * few times a year. Each isolate keeps it for TRUSTED_CACHE_MS and the one
 * that saved a change drops its copy at once, so an edit reaches every
 * request within half a minute without a D1 read per event.
 *
 * Only a real read is cached. With no database the list is the env floor,
 * which costs nothing to rebuild, and after a failed read it is kept for
 * FALLBACK_CACHE_MS only: caching the floor for the full 30 seconds meant one
 * D1 hiccup dropped every panel-added network, the owner's exemption and
 * internal mark with them, for half a minute after D1 had recovered.
 *
 * ── Why the panel's floor is narrower than the env's ────────────────────────
 * A network added here lifts the chat limits for everyone behind it, and one
 * compromised admin session can add one. So the panel takes nothing wider
 * than /24 (IPv4) or /48 (IPv6): an office, a home, a site. The env floor
 * keeps parseCidrList's /16 and /32, since editing the Worker is a deploy.
 *
 * ── What it cannot do ──────────────────────────────────────────────────────
 * A session is marked internal when it is recorded, because the address it
 * came from is never stored. Adding a network excludes the next visit from
 * it, not the ones already counted.
 *
 * No `db.ts` import, so `npm run test:units` can run it against
 * scripts/d1-sqlite.ts; callers pass the database in.
 */
import { canonicalCidr, parseCidrList, type Cidr } from './net';

export const TRUSTED_CACHE_MS = 30_000;
export const FALLBACK_CACHE_MS = 3_000;
/** Enough for every home, office and phone network one person uses. */
export const MAX_TRUSTED = 50;
/** Broadest range the panel accepts. See the header. */
export const PANEL_MIN_IPV4_PREFIX = 24;
export const PANEL_MIN_IPV6_PREFIX = 48;
const MAX_LABEL = 60;

export interface TrustedEntry {
  cidr: string;
  label: string;
  addedAt: number | null;
  addedBy: string;
  source: 'panel' | 'env';
}

/** Trimmed, lowercase, and a bare address given its single-host prefix. Null when it cannot be a CIDR. */
function typed(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (!value || value.includes(',') || value.length > 64) return null;
  return value.includes('/') ? value : `${value}/${value.includes(':') ? 128 : 32}`;
}

/**
 * One address or range as the panel may add it, in canonical form, or null.
 *
 * A bare address becomes a single-host range (/32 or /128), host bits are
 * masked and IPv6 is compressed (canonicalCidr), so two spellings of one
 * network are one row. Nothing wider than the panel floor, /24 or /48.
 */
export function normaliseCidr(input: string): string | null {
  const value = typed(input);
  return value ? canonicalCidr(value, PANEL_MIN_IPV4_PREFIX, PANEL_MIN_IPV6_PREFIX) : null;
}

function envEntries(): TrustedEntry[] {
  const seen = new Set<string>();
  const out: TrustedEntry[] = [];
  for (const [name, raw] of [
    ['ANALYTICS_INTERNAL_CIDRS', process.env.ANALYTICS_INTERNAL_CIDRS],
    ['CHAT_UNLIMITED_CIDRS', process.env.CHAT_UNLIMITED_CIDRS],
  ] as const) {
    for (const cidr of parseCidrList(raw)) {
      if (seen.has(cidr.raw)) continue;
      seen.add(cidr.raw);
      out.push({ cidr: cidr.raw, label: name, addedAt: null, addedBy: '', source: 'env' });
    }
  }
  return out;
}

/** Everything, env first, for the panel. */
export async function listTrusted(db: D1Database | null): Promise<TrustedEntry[]> {
  const rows = db
    ? ((
        await db
          .prepare(`SELECT cidr, label, added_at, added_by FROM trusted_networks ORDER BY added_at`)
          .all<{ cidr: string; label: string; added_at: number; added_by: string }>()
      ).results ?? [])
    : [];
  const env = envEntries();
  const envSet = new Set(env.map((e) => e.cidr));
  // A row saved before canonical storage may be spelt differently from the
  // env entry it duplicates, so compare networks rather than strings.
  return [
    ...env,
    ...rows
      .filter((r) => !envSet.has(canonicalCidr(r.cidr) ?? r.cidr))
      .map((r) => ({ cidr: r.cidr, label: r.label, addedAt: r.added_at, addedBy: r.added_by, source: 'panel' as const })),
  ];
}

let cache: { until: number; cidrs: Cidr[] } | null = null;

const matchers = (entries: TrustedEntry[]) => parseCidrList(entries.map((e) => e.cidr).join(','));

/**
 * The merged list as matchers, cached per isolate. Never throws: a failed
 * read is the env floor, kept for FALLBACK_CACHE_MS rather than the full
 * window, and no database is the env floor, not cached at all.
 */
export async function trustedCidrs(db: D1Database | null, now: number = Date.now()): Promise<Cidr[]> {
  if (!db) return matchers(envEntries());
  if (cache && now < cache.until) return cache.cidrs;
  try {
    const cidrs = matchers(await listTrusted(db));
    cache = { until: now + TRUSTED_CACHE_MS, cidrs };
    return cidrs;
  } catch (error) {
    console.error('[trusted] list read failed, using env only', error);
    const cidrs = matchers(envEntries());
    cache = { until: now + FALLBACK_CACHE_MS, cidrs };
    return cidrs;
  }
}

/** Test seam, and what a write in this isolate calls so its own next read is fresh. */
export function resetTrustedCache(): void {
  cache = null;
}

export type TrustedChange = { ok: true } | { ok: false; error: 'invalid' | 'full' | 'env' | 'missing' };

export async function addTrusted(
  db: D1Database,
  input: string,
  label: string,
  addedBy: string,
  now: number = Date.now(),
): Promise<TrustedChange> {
  const cidr = normaliseCidr(input);
  if (!cidr) return { ok: false, error: 'invalid' };
  const count = await db.prepare(`SELECT COUNT(*) AS n FROM trusted_networks`).first<{ n: number }>();
  const exists = await db.prepare(`SELECT 1 AS x FROM trusted_networks WHERE cidr = ?1`).bind(cidr).first();
  if (!exists && (count?.n ?? 0) >= MAX_TRUSTED) return { ok: false, error: 'full' };
  await db
    .prepare(
      `INSERT INTO trusted_networks (cidr, label, added_at, added_by) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(cidr) DO UPDATE SET label = excluded.label`,
    )
    .bind(cidr, label.trim().slice(0, MAX_LABEL), now, addedBy.slice(0, 120))
    .run();
  resetTrustedCache();
  return { ok: true };
}

/**
 * Remove one row, by the string it is stored as or by its network.
 *
 * Judged against the env floor, not the panel's: a row added before the
 * panel floor existed (a /20, say) must still be removable. And matched on
 * both spellings, because rows saved before canonical storage keep the text
 * they were typed as, which is what the panel sends back.
 */
export async function removeTrusted(db: D1Database, input: string): Promise<TrustedChange> {
  const value = typed(input);
  if (!value) return { ok: false, error: 'invalid' };
  const cidr = canonicalCidr(value);
  if (cidr && envEntries().some((e) => e.cidr === cidr)) return { ok: false, error: 'env' };
  const result = await db
    .prepare(`DELETE FROM trusted_networks WHERE cidr IN (?1, ?2)`)
    .bind(value, cidr ?? value)
    .run();
  resetTrustedCache();
  if ((result.meta?.changes ?? 0) > 0) return { ok: true };
  return { ok: false, error: cidr ? 'missing' : 'invalid' };
}
