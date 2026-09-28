/**
 * The daily question allowance on /api/chat: 50 per browser, 300 per network.
 *
 * ── Why two counters ───────────────────────────────────────────────────────
 * There is no way to identify a person without a login, so the allowance is
 * charged against the two things the server can see, each chosen for the
 * failure the other has.
 *
 *   browser   a random id in an HttpOnly cookie, minted here and signed, so
 *             the count follows one browser across tabs and reloads. On its
 *             own it resets with a private window or cleared site data.
 *   network   the salted, /64-for-IPv6 address hash the per-minute limit
 *             already uses (chat-limit.ts). On its own it would make an
 *             office, a campus or a mobile carrier's shared IPv4 address one
 *             "visitor", and a recruiter could find the chat closed because
 *             a colleague used it. So it is a backstop, at six times the
 *             browser allowance, there to stop one person minting browsers.
 *
 * The number the panel shows is the browser's. The network ceiling is only
 * ever seen by someone who has been working around the first one.
 *
 * ── The window ─────────────────────────────────────────────────────────────
 * 24 hours from a bucket's first question, not a calendar day: a visitor who
 * starts at 23:50 does not get a second allowance ten minutes later. The row
 * is reset in place when the window has passed, and retention.ts deletes rows
 * whose window closed a day ago.
 *
 * ── Degrading open ─────────────────────────────────────────────────────────
 * No database or no salt means no allowance, the same choice chat-limit.ts
 * makes and for the same reason: the chatbot answering matters more than the
 * counter. A failure while counting is logged and the question allowed.
 *
 * The database is passed in, already through ensureSchema(), rather than
 * fetched here: db.ts imports `cloudflare:workers`, and this file is
 * unit-tested in a bare Node process against scripts/d1-sqlite.ts.
 */
import { authorizeAdmin, readCookie } from './admin-auth';
import { clientIp, matchesAnyCidr } from './net';
import { trustedCidrs } from './trusted';
import { signWith, verifyWith } from '@/lib/chat/turn-sig';
import { DAILY_QUESTIONS, QUOTA_HEADERS, QUOTA_WINDOW_MS, type Quota } from '@/lib/chat/quota';

export const QUOTA_COOKIE = 'pf_chat';
const ID_LABEL = 'portfolio chat-quota id v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** A year: the id outlives any window, so the count is not reset by the cookie expiring. */
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

const positive = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/** Questions per browser per window. CHAT_DAILY_LIMIT; `.env.local` raises it so test:chat can run. */
export function chatDailyLimit(): number {
  return positive(process.env.CHAT_DAILY_LIMIT, DAILY_QUESTIONS);
}

/** Questions per network per window. CHAT_DAILY_NETWORK_LIMIT. */
export function chatDailyNetworkLimit(): number {
  return positive(process.env.CHAT_DAILY_NETWORK_LIMIT, DAILY_QUESTIONS * 6);
}

/** The browser id in the request's cookie, if it carries a valid signature. */
export async function readBrowserId(request: Request, secret: string): Promise<string | null> {
  const raw = readCookie(request, QUOTA_COOKIE);
  if (!raw) return null;
  const dot = raw.indexOf('.');
  const id = raw.slice(0, dot);
  if (dot < 0 || !UUID.test(id)) return null;
  return (await verifyWith(ID_LABEL, id, raw.slice(dot + 1), secret)) ? id : null;
}

/** A fresh browser id and the Set-Cookie header that stores it. */
export async function mintBrowserId(secret: string): Promise<{ id: string; cookie: string }> {
  const id = crypto.randomUUID();
  const token = `${id}.${await signWith(ID_LABEL, id, secret)}`;
  // HttpOnly: page script never needs it, so nothing on the page can read or
  // forge it. Path-scoped to the one route that reads it.
  return { id, cookie: `${QUOTA_COOKIE}=${token}; Path=/api/chat; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax` };
}

/**
 * Charge one question to `bucket`, in one statement.
 *
 * The count is capped at limit + 1, so a refused caller who keeps asking does
 * not keep writing a larger number; +1 is what says "refused". SQLite
 * evaluates every SET expression against the old row, so both CASEs see the
 * same window.
 */
export async function chargeQuota(
  db: D1Database,
  bucket: string,
  limit: number,
  now: number,
): Promise<{ allowed: boolean; used: number; resetAt: number }> {
  const row = await db
    .prepare(
      `INSERT INTO chat_quota (bucket, window_start, questions) VALUES (?1, ?2, 1)
       ON CONFLICT(bucket) DO UPDATE SET
         questions = CASE WHEN chat_quota.window_start > ?2 - ?4
                          THEN MIN(chat_quota.questions + 1, ?3 + 1) ELSE 1 END,
         window_start = CASE WHEN chat_quota.window_start > ?2 - ?4
                             THEN chat_quota.window_start ELSE ?2 END
       RETURNING questions, window_start`,
    )
    .bind(bucket, now, limit, QUOTA_WINDOW_MS)
    .first<{ questions: number; window_start: number }>();
  const used = row?.questions ?? 1;
  return { allowed: used <= limit, used, resetAt: (row?.window_start ?? now) + QUOTA_WINDOW_MS };
}

export interface QuotaVerdict {
  allowed: boolean;
  /** Which counter refused, when one did. */
  refusedBy: 'browser' | 'network' | null;
  /** What to tell the panel; null when no allowance is being kept. */
  quota: Quota | null;
  /** Set on the response when this request minted the browser id. */
  setCookie: string | null;
  /** No allowance applies: see chatExemption(). */
  unlimited?: boolean;
}

const OPEN: QuotaVerdict = { allowed: true, refusedBy: null, quota: null, setCookie: null };
export const UNLIMITED_VERDICT: QuotaVerdict = { ...OPEN, unlimited: true };

/**
 * Who is not held to any chat limit, per-minute or daily: the owner testing
 * the site.
 *
 *   network  the caller's address is on the trusted-network list: the one
 *            edited in /admin, which also excludes it from analytics, merged
 *            with the CHAT_UNLIMITED_CIDRS and ANALYTICS_INTERNAL_CIDRS env
 *            floor (lib/analytics/trusted.ts). Read from cf-connecting-ip,
 *            which Cloudflare sets and a client cannot. Everyone behind that
 *            address is exempt too, which is the point of listing an office
 *            or a home connection.
 *   admin    the request passes authorizeAdmin(): a live pa_admin session
 *            (the cookie is Path=/, so it reaches this route) for an address
 *            that ADMIN_EMAILS still lists, or the admin bearer token. The
 *            allowlist is re-read per request, so removing an address ends
 *            the exemption at once.
 *
 * Any failure here is "not exempt", never "exempt".
 */
export async function chatExemption(request: Request, db: D1Database | null): Promise<'network' | 'admin' | null> {
  try {
    const { ip } = clientIp(request);
    if (ip && matchesAnyCidr(ip, await trustedCidrs(db))) return 'network';
    if (await authorizeAdmin(request)) return 'admin';
  } catch (error) {
    console.error('[chat] exemption check failed', error);
  }
  return null;
}

/**
 * Charge one question to the caller's browser, then to its network.
 *
 * Browser first: a browser already over its allowance is refused without
 * touching the network counter, so one visitor hammering a closed chat cannot
 * spend the allowance of everyone else on the same office connection.
 */
export async function chargeChatQuota(
  request: Request,
  networkBucket: string | null,
  db: D1Database | null,
  now: number = Date.now(),
): Promise<QuotaVerdict> {
  try {
    const secret = process.env.ANALYTICS_IP_SALT;
    if (!secret || !db) return OPEN;

    let id = await readBrowserId(request, secret);
    let setCookie: string | null = null;
    if (!id) ({ id, cookie: setCookie } = await mintBrowserId(secret));

    const limit = chatDailyLimit();
    const browser = await chargeQuota(db, `b:${id}`, limit, now);
    const quota: Quota = { limit, remaining: Math.max(0, limit - browser.used), resetAt: browser.resetAt };
    if (!browser.allowed) return { allowed: false, refusedBy: 'browser', quota, setCookie };

    if (networkBucket) {
      const network = await chargeQuota(db, `n:${networkBucket}`, chatDailyNetworkLimit(), now);
      if (!network.allowed) return { allowed: false, refusedBy: 'network', quota: { limit, remaining: 0, resetAt: network.resetAt }, setCookie };
    }
    return { allowed: true, refusedBy: null, quota, setCookie };
  } catch (error) {
    console.error('[chat] quota check failed', error);
    return OPEN;
  }
}

/**
 * A site-wide ceiling on model-tier calls, per 24 hours. CHAT_MODEL_DAILY_LIMIT.
 *
 * The per-browser and per-network allowances bound what one visitor can ask;
 * nothing bounded what the whole site could spend on NVIDIA. This is one
 * counter row in chat_quota, bucket `model:global`, charged by the same
 * statement and on the same 24-hour window as the others, and it is charged
 * only when a question is about to go to the model, not per question.
 */
export const MODEL_BUCKET = 'model:global';
export function chatModelDailyLimit(): number {
  return positive(process.env.CHAT_MODEL_DAILY_LIMIT, 1000);
}

/**
 * Charge one model call. False means today's ceiling is spent and the caller
 * serves the curated answer instead, which is not an error to the visitor.
 *
 * Degrades open, like everything here: no database, or a failure counting,
 * allows the call. Exempt callers (chatExemption) are charged, so the
 * counter tells the truth about spend, but the route does not refuse them.
 */
export async function chargeModelCall(db: D1Database | null, now: number = Date.now()): Promise<boolean> {
  if (!db) return true;
  try {
    return (await chargeQuota(db, MODEL_BUCKET, chatModelDailyLimit(), now)).allowed;
  } catch (error) {
    console.error('[chat] model cap check failed', error);
    return true;
  }
}

/** The allowance as response headers, plus the cookie when one was minted. */
export function applyQuota(response: Response, verdict: QuotaVerdict): Response {
  if (verdict.quota) {
    response.headers.set(QUOTA_HEADERS.limit, String(verdict.quota.limit));
    response.headers.set(QUOTA_HEADERS.remaining, String(verdict.quota.remaining));
    response.headers.set(QUOTA_HEADERS.reset, String(verdict.quota.resetAt));
  }
  if (verdict.unlimited) response.headers.set(QUOTA_HEADERS.unlimited, '1');
  if (verdict.setCookie) response.headers.append('Set-Cookie', verdict.setCookie);
  return response;
}
