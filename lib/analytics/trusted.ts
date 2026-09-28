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
 * ── What it cannot do ──────────────────────────────────────────────────────
 * A session is marked internal when it is recorded, because the address it
 * came from is never stored. Adding a network excludes the next visit from
 * it, not the ones already counted.
 *
 * No `db.ts` import, so `npm run test:units` can run it against
 * scripts/d1-sqlite.ts; callers pass the database in.
 */
import { parseCidrList, type Cidr } from './net';

export const TRUSTED_CACHE_MS = 30_000;
/** Enough for every home, office and phone network one person uses. */
export const MAX_TRUSTED = 50;
const MAX_LABEL = 60;

export interface TrustedEntry {
  cidr: string;
  label: string;
  addedAt: number | null;
  addedBy: string;
  source: 'panel' | 'env';
}

/**
 * One address or range, in canonical form, or null when it is not usable.
 *
 * A bare address becomes a single-host range (/32 or /128). The breadth rule
 * is parseCidrList's: nothing wider than /16 for IPv4 or /32 for IPv6, since
 * a stray /0 would mark every visitor internal and lift every chat limit.
 */
export function normaliseCidr(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (!value || value.includes(',') || value.length > 64) return null;
  const withPrefix = value.includes('/') ? value : `${value}/${value.includes(':') ? 128 : 32}`;
  return parseCidrList(withPrefix).length === 1 ? withPrefix : null;
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
  return [
    ...env,
    ...rows
      .filter((r) => !envSet.has(r.cidr))
      .map((r) => ({ cidr: r.cidr, label: r.label, addedAt: r.added_at, addedBy: r.added_by, source: 'panel' as const })),
  ];
}

let cache: { at: number; cidrs: Cidr[] } | null = null;

/** The merged list as matchers, cached per isolate. Never throws: a failed read is the env floor. */
export async function trustedCidrs(db: D1Database | null, now: number = Date.now()): Promise<Cidr[]> {
  if (cache && now - cache.at < TRUSTED_CACHE_MS) return cache.cidrs;
  let entries: TrustedEntry[];
  try {
    entries = await listTrusted(db);
  } catch (error) {
    console.error('[trusted] list read failed, using env only', error);
    entries = envEntries();
  }
  const cidrs = parseCidrList(entries.map((e) => e.cidr).join(','));
  cache = { at: now, cidrs };
  return cidrs;
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

export async function removeTrusted(db: D1Database, input: string): Promise<TrustedChange> {
  const cidr = normaliseCidr(input);
  if (!cidr) return { ok: false, error: 'invalid' };
  if (envEntries().some((e) => e.cidr === cidr)) return { ok: false, error: 'env' };
  const result = await db.prepare(`DELETE FROM trusted_networks WHERE cidr = ?1`).bind(cidr).run();
  resetTrustedCache();
  return (result.meta?.changes ?? 0) > 0 ? { ok: true } : { ok: false, error: 'missing' };
}
