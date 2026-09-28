/**
 * The daily question allowance, as both ends of /api/chat see it.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 * DAILY_QUESTIONS (50) per browser in any 24 hours, counted from that
 * browser's first question, with a looser per-network ceiling behind it. The
 * server enforces it (lib/analytics/chat-quota.ts); this file is only the
 * vocabulary the panel and the route share, so it imports nothing and runs in
 * the browser, on the Worker and in `npm run test:units`.
 *
 * ── Why the panel is told, and how ─────────────────────────────────────────
 * Every /api/chat response carries the allowance in three headers, so the
 * panel can say "5 questions left today" before the visitor runs into the
 * wall rather than after. Headers rather than a body field because they reach
 * the streaming path too, before the first token.
 */

/** The default allowance per browser per 24 hours. CHAT_DAILY_LIMIT overrides it on the server. */
export const DAILY_QUESTIONS = 50;

/** When the panel starts warning. */
export const QUOTA_WARN_AT = 5;

export const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

export const QUOTA_HEADERS = {
  limit: 'X-Chat-Limit',
  remaining: 'X-Chat-Remaining',
  reset: 'X-Chat-Reset',
  /** Present, as `1`, when no allowance applies to this caller (an admin, or a trusted network). */
  unlimited: 'X-Chat-Unlimited',
} as const;

/** What the panel stores instead of an allowance when none applies. */
export const UNLIMITED = 'unlimited';

/** The 429 body's `code` when the allowance, not the per-minute rate, refused. */
export const DAILY_LIMIT_CODE = 'daily_limit';

export interface Quota {
  limit: number;
  remaining: number;
  /** Epoch ms at which the window restarts. */
  resetAt: number;
}

const whole = (value: string | null | undefined): number | null => {
  if (value == null || !/^\d{1,15}$/.test(value.trim())) return null;
  return Number(value.trim());
};

/** The allowance a response reported, or null when it carried none (no database, an old Worker). */
export function readQuota(headers: { get(name: string): string | null }): Quota | null {
  const limit = whole(headers.get(QUOTA_HEADERS.limit));
  const remaining = whole(headers.get(QUOTA_HEADERS.remaining));
  const resetAt = whole(headers.get(QUOTA_HEADERS.reset));
  if (limit === null || remaining === null || resetAt === null || limit < 1) return null;
  return { limit, remaining: Math.min(remaining, limit), resetAt };
}

/** As kept in localStorage: `limit|remaining|resetAt`. */
export function serialiseQuota(quota: Quota): string {
  return `${quota.limit}|${quota.remaining}|${quota.resetAt}`;
}

export function parseQuota(raw: string): Quota | null {
  const [limit, remaining, resetAt] = raw.split('|').map(whole);
  if (limit == null || remaining == null || resetAt == null || limit < 1) return null;
  return { limit, remaining: Math.min(remaining, limit), resetAt };
}

/** A stored allowance whose window has passed says nothing any more. */
export function quotaExpired(quota: Quota | null, now: number = Date.now()): boolean {
  return quota !== null && quota.resetAt <= now;
}
