/**
 * The rate limit on /api/chat, and the identity it forwards to the backend.
 *
 * ── Why /api/chat needed one at all ────────────────────────────────────────
 * /api/track has charged a per-address budget since it landed, because it is
 * unauthenticated and writes to D1. /api/chat is unauthenticated and writes to
 * D1 too (recordChatHealth() is one INSERT … ON CONFLICT per request) and it
 * had nothing. Verified with ten anonymous POSTs moving chat_health.requests
 * from 80 to 90: no session id, no cookie, no origin check, no budget.
 *
 * The two endpoints share one database, so an unmetered writer on /api/chat
 * spends the same daily write quota that analytics ingest depends on. The
 * 500-character body cap does not help; small requests are the cheap ones.
 *
 * ── Sharing ingest_budget, not adding a table ──────────────────────────────
 * Same durability argument as chargeBudget's own note: an in-memory Map does
 * not survive a Worker isolate, and the counter has to be written to be read.
 * Bucket keys are namespaced `chat:<hash>` against ingest's bare `<hash>`, so
 * neither caller can spend the other's allowance, and retention.ts already
 * sweeps rows older than an hour regardless of prefix.
 *
 * ── Degrading open, on purpose ─────────────────────────────────────────────
 * No database or no salt means no limit, and also no write to protect, since
 * recordChatHealth() is a no-op without a database. The chatbot answering is
 * more important than the counter, and Chat.tsx falls back to a local answer
 * on any non-OK response, so a 429 costs the visitor nothing but the "Offline"
 * label. That is exactly why the ceiling can be generous.
 */

import { getDb } from './db';
import { chargeBudget } from './ingest';
import { clientIp, hashIp } from './net';

/**
 * Requests per address per minute.
 *
 * Well above any human, the panel's own median is a handful of questions per
 * session, and far below what it takes to matter to a D1 write quota.
 *
 * Configurable, and named to match backend/main.py's CHAT_RATE_LIMIT so the
 * two ends of the same limit are not two different words. The reason it is
 * configurable is not tuning: `tests/chat.mjs` replays 75 cases in a burst
 * against a live dev server, which is a fifth of a normal session's traffic
 * arriving in two seconds. Raising the ceiling for that is correct; carving a
 * loopback or a header-based exemption into the limiter would mean shipping a
 * bypass to production so that a test could pass.
 */
export function chatRequestsPerMinute(): number {
  const raw = Number(process.env.CHAT_RATE_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 20;
}

export interface ChatClient {
  /** Truncated salted hash, or null when it could not be established. */
  bucket: string | null;
  allowed: boolean;
}

/**
 * Charge one request against the caller's budget.
 *
 * Returns the bucket as well, because the backend needs the same value: see
 * the note on X-Client-Bucket in app/api/chat/route.ts.
 */
export async function chargeChatRequest(
  request: Request,
  now: number = Date.now(),
): Promise<ChatClient> {
  try {
    const salt = process.env.ANALYTICS_IP_SALT;
    const db = getDb();
    if (!salt || !db) return { bucket: null, allowed: true };

    const { ip } = clientIp(request);
    if (!ip) return { bucket: null, allowed: true };

    // Half the digest. 128 bits is far past collision-resistant for a
    // per-minute counter, and there is no reason to hand the backend more of
    // the hash than the bucketing needs.
    const bucket = (await hashIp(ip, salt)).slice(0, 32);
    const { allowed } = await chargeBudget(
      db,
      `chat:${bucket}`,
      1,
      now,
      chatRequestsPerMinute(),
    );
    return { bucket, allowed };
  } catch (error) {
    // A failure here must never cost the visitor an answer.
    console.error('[chat] rate limit check failed', error);
    return { bucket: null, allowed: true };
  }
}
