/**
 * Traffic-source bucketing, in TypeScript, not SQL.
 *
 * Lumen did this with `~*` regex CASE ladders inside its Postgres function.
 * D1 registers no REGEXP, so it could not be ported literally, but this is
 * strictly better anyway: the rules are unit-testable, and the raw host list
 * ships alongside the buckets so an unexpected referrer is visible rather than
 * swept into "referral".
 *
 * The event row stores `referrer_host` (host only, computed at ingest); every
 * bucket decision happens here on the way out.
 */

export type SourceBucket =
  | 'direct'
  | 'organic'
  | 'social'
  | 'ai'
  | 'referral';

/** Host suffix -> bucket. Longest match wins, so subdomains behave. */
const HOST_RULES: readonly { suffix: string; bucket: SourceBucket }[] = [
  { suffix: 'google.com', bucket: 'organic' },
  { suffix: 'google.co.in', bucket: 'organic' },
  { suffix: 'bing.com', bucket: 'organic' },
  { suffix: 'duckduckgo.com', bucket: 'organic' },
  { suffix: 'search.brave.com', bucket: 'organic' },
  { suffix: 'ecosia.org', bucket: 'organic' },
  { suffix: 'yandex.com', bucket: 'organic' },
  { suffix: 'linkedin.com', bucket: 'social' },
  { suffix: 'lnkd.in', bucket: 'social' },
  { suffix: 'x.com', bucket: 'social' },
  { suffix: 'twitter.com', bucket: 'social' },
  { suffix: 't.co', bucket: 'social' },
  { suffix: 'facebook.com', bucket: 'social' },
  { suffix: 'instagram.com', bucket: 'social' },
  { suffix: 'reddit.com', bucket: 'social' },
  { suffix: 'news.ycombinator.com', bucket: 'social' },
  { suffix: 'github.com', bucket: 'referral' },
  { suffix: 'wa.me', bucket: 'social' },
  { suffix: 'whatsapp.com', bucket: 'social' },
  { suffix: 'telegram.org', bucket: 'social' },
  { suffix: 't.me', bucket: 'social' },
  // Worth their own bucket on a developer portfolio: an assistant citing the
  // site is a different kind of arrival from a search result, and lumping them
  // into organic hides the one trend actually worth watching.
  { suffix: 'chatgpt.com', bucket: 'ai' },
  { suffix: 'chat.openai.com', bucket: 'ai' },
  { suffix: 'claude.ai', bucket: 'ai' },
  { suffix: 'perplexity.ai', bucket: 'ai' },
  { suffix: 'gemini.google.com', bucket: 'ai' },
  { suffix: 'copilot.microsoft.com', bucket: 'ai' },
];

/** The host of a referrer URL, or null for a direct arrival. */
export function referrerHost(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

export function bucketForHost(host: string | null): SourceBucket {
  if (!host) return 'direct';
  let best: { len: number; bucket: SourceBucket } | null = null;
  for (const rule of HOST_RULES) {
    if (host === rule.suffix || host.endsWith(`.${rule.suffix}`)) {
      if (!best || rule.suffix.length > best.len) {
        best = { len: rule.suffix.length, bucket: rule.bucket };
      }
    }
  }
  return best?.bucket ?? 'referral';
}

/**
 * The network an ad click id came from, named the way a utm_source would be.
 *
 * Google Ads and Meta auto-tagging append `gclid`/`fbclid` and no utm_source
 * at all, so without this the same campaign appears under two different names.
 */
export function clickNetwork(source: string | null): string | null {
  if (source === 'gclid') return 'google_ads';
  if (source === 'fbclid') return 'meta';
  return null;
}

/**
 * The precedence ladder for "where did this session come from".
 *
 * **Order is load-bearing**: the ad-click check comes BEFORE the referrer
 * bucket, because a paid click arrives *from* google.com and referrer-first
 * bucketing files every ad as organic search. Lumen's comment on this is
 * worth keeping.
 */
export function resolveSource(row: {
  utm_source: string | null;
  utm_medium: string | null;
  click_id_source: string | null;
  referrer_host: string | null;
}): { source: string; medium: string; tagged: 'utm' | 'ad' | 'referrer' | 'none' } {
  if (row.utm_source) {
    return {
      source: row.utm_source,
      medium: row.utm_medium ?? '(none)',
      tagged: 'utm',
    };
  }
  const network = clickNetwork(row.click_id_source);
  if (network) return { source: network, medium: 'cpc', tagged: 'ad' };

  if (row.referrer_host) {
    return {
      source: row.referrer_host,
      medium: bucketForHost(row.referrer_host),
      tagged: 'referrer',
    };
  }
  return { source: '(direct)', medium: 'none', tagged: 'none' };
}
