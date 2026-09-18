/**
 * Campaign attribution, which link brought this person here.
 *
 * Three stores, each answering a different question:
 *
 *   pfVisitorId   localStorage    which browser is this (across sessions)
 *   pfFirstTouch  localStorage    which campaign ACQUIRED them (write-once)
 *   pfLastTouch   sessionStorage  which campaign started THIS session
 *
 * First touch is what a campaign gets credit for; last touch is what the
 * current session's rows are stamped with. They differ for anyone who arrives
 * twice, and conflating them lets a second visit steal the acquisition.
 *
 * Dropped from the source system: stampFirstTouchOnce() (no accounts to stamp
 * onto) and campaignParams() (no dataLayer, GTM and GA4 are deliberately not
 * part of this).
 *
 * Nothing here records anything on its own: trackingSuppressed() is consulted
 * first, because the heatmap frames the real page and capture would otherwise
 * rewrite the framed page's URL underneath it.
 */

import { trackingSuppressed } from './scope';
import {
  isValidClickId,
  normalisePath,
  normaliseUtmValue,
} from './normalise';

const VISITOR_ID_KEY = 'pfVisitorId';
const FIRST_TOUCH_KEY = 'pfFirstTouch';
const LAST_TOUCH_KEY = 'pfLastTouch';

/**
 * How long a first touch keeps its claim.
 *
 * Not a privacy figure, a shared-device mitigation. Without an expiry, the
 * second person to open the site on a borrowed laptop inherits the first
 * person's campaign forever.
 */
const FIRST_TOUCH_TTL_DAYS = 90;
const FIRST_TOUCH_TTL_MS = FIRST_TOUCH_TTL_DAYS * 24 * 60 * 60 * 1000;

/** The params we own. Everything else on the URL is left exactly as it was. */
const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

const CLICK_ID_PARAMS = ['gclid', 'fbclid'] as const;

/** Params that must survive cleanUrl, the heatmap preview reads all three. */
const PRESERVED_PARAMS = ['embed', 'preview', 'preview_mode'];

export interface Attribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  click_id: string | null;
  click_id_source: 'gclid' | 'fbclid' | null;
  landing_path: string | null;
  visitor_id: string | null;
}

export interface FirstTouch extends Attribution {
  /** ISO timestamp of the claim. Also what the TTL is measured against. */
  first_touch_at: string;
}

/**
 * In-memory fallbacks.
 *
 * Safari private mode, iOS Lockdown and "block all site data" make every
 * storage write throw. Losing the cross-session link there is unavoidable;
 * losing the *landing row's* campaign is not, so the parsed value is kept here
 * and the visit that just happened is still attributed correctly.
 */
let memoryTouch: Attribution | null = null;
let memoryVisitorId: string | null = null;

/** captureAttribution() is idempotent per page load; this is the latch. */
let captured = false;

function readStore(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(store: Storage, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    /* private mode, the memory fallbacks cover this page load */
  }
}

function readJson<T>(store: Storage, key: string): T | null {
  const raw = readStore(store, key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    // A hand-edited or half-written value is not worth crashing boot over.
    return null;
  }
}

/** Ad click ids are case-significant, so this validates rather than folds. */
function readClickId(
  params: URLSearchParams,
): Pick<Attribution, 'click_id' | 'click_id_source'> {
  for (const name of CLICK_ID_PARAMS) {
    const raw = params.get(name);
    if (!raw || !isValidClickId(raw)) continue;
    return { click_id: raw, click_id_source: name };
  }
  return { click_id: null, click_id_source: null };
}

/**
 * The one identifier that survives a closed tab.
 *
 * Random, per-browser, and carries nothing about the person, it exists so the
 * session that clicked a link and the session that came back later can be
 * recognised as the same browser. On a storage failure it falls back to a
 * per-page-load value: that browser then reports one visitor per load, which
 * is wrong but harmless, and better than sending null.
 */
export function ensureVisitorId(): string {
  const existing = readStore(localStorage, VISITOR_ID_KEY);
  if (existing) return existing;
  if (memoryVisitorId) return memoryVisitorId;

  const id = crypto.randomUUID();
  memoryVisitorId = id;
  writeStore(localStorage, VISITOR_ID_KEY, id);
  return id;
}

/** Reads the five UTMs + a click id, or null when the URL is untagged. */
function readTouch(params: URLSearchParams): Attribution | null {
  const utms = {
    utm_source: normaliseUtmValue(params.get('utm_source')),
    utm_medium: normaliseUtmValue(params.get('utm_medium')),
    utm_campaign: normaliseUtmValue(params.get('utm_campaign')),
    utm_content: normaliseUtmValue(params.get('utm_content')),
    utm_term: normaliseUtmValue(params.get('utm_term')),
  };
  const click = readClickId(params);

  const tagged =
    Object.values(utms).some((v) => v !== null) || click.click_id !== null;
  if (!tagged) return null;

  return {
    ...utms,
    ...click,
    landing_path: normalisePath(window.location.pathname),
    visitor_id: null, // filled by captureAttribution once the id is minted
  };
}

/**
 * Remove our params from the address bar, leaving every other one alone.
 *
 * Two reasons. Someone who copies the URL out of their address bar and shares
 * it would otherwise re-attribute a stranger's session to a campaign they never
 * saw; and a tagged URL left in history means a back-navigation re-reads it as
 * a fresh arrival.
 *
 * Deletes a known list rather than clearing the search string, because the
 * heatmap preview's three params must survive untouched.
 */
function cleanUrl(params: URLSearchParams): void {
  try {
    for (const name of [...UTM_PARAMS, ...CLICK_ID_PARAMS]) {
      if (PRESERVED_PARAMS.includes(name)) continue;
      params.delete(name);
    }
    const query = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${
        window.location.hash
      }`,
    );
  } catch {
    /* history unavailable, the URL stays tagged, which costs nothing */
  }
}

function claimFirstTouch(touch: Attribution): void {
  const existing = readJson<FirstTouch>(localStorage, FIRST_TOUCH_KEY);
  if (existing?.first_touch_at) {
    const age = Date.now() - Date.parse(existing.first_touch_at);
    // NaN (a corrupt timestamp) is not > TTL, so a bad value keeps its claim
    // rather than letting every later visit overwrite it.
    if (!(age > FIRST_TOUCH_TTL_MS)) return;
  }
  const first: FirstTouch = {
    ...touch,
    first_touch_at: new Date().toISOString(),
  };
  writeStore(localStorage, FIRST_TOUCH_KEY, JSON.stringify(first));
}

/**
 * Read the campaign off this page load. Call once, before anything renders.
 *
 * An **untagged** load deliberately does nothing beyond minting the visitor id:
 * it must not clear the session's last touch, and it must not claim first touch
 * as `direct`: which would permanently mark someone as organic and make every
 * campaign they later arrive from look like it acquired nobody.
 */
export function captureAttribution(): void {
  if (captured) return;
  captured = true;

  try {
    if (trackingSuppressed()) return;

    const params = new URLSearchParams(window.location.search);
    const touch = readTouch(params);
    const visitorId = ensureVisitorId();
    if (!touch) return;

    const withVisitor: Attribution = { ...touch, visitor_id: visitorId };
    memoryTouch = withVisitor;
    writeStore(sessionStorage, LAST_TOUCH_KEY, JSON.stringify(withVisitor));
    claimFirstTouch(withVisitor);
    cleanUrl(params);
  } catch {
    /* crypto or storage unavailable, must never break boot */
  }
}

/** The campaign this session landed on, or null for untagged traffic. */
export function currentAttribution(): Attribution | null {
  return readJson<Attribution>(sessionStorage, LAST_TOUCH_KEY) ?? memoryTouch;
}

/**
 * What the `visit` row is stamped with: the campaign, and always the visitor id.
 *
 * These two used to travel as one block in the source system, which quietly
 * made the id conditional on the URL being tagged, so `visitor_id` reached the
 * event log only for campaign traffic, every other session landed in the
 * audience panel's `unknown` bucket, and the new-vs-returning split could only
 * ever describe people who arrived from a marketing link.
 *
 * The id is browser identity, not campaign data, so it is attached here rather
 * than inside the touch.
 */
export function visitAttribution(): Partial<Attribution> | null {
  const touch = currentAttribution();

  let visitorId: string | null = null;
  try {
    visitorId = ensureVisitorId();
  } catch {
    /* crypto or storage unavailable: a campaign, if any, still travels */
  }

  if (!touch && !visitorId) return null;
  // Spreading null yields no keys, so no `?? {}` fallback is needed.
  return { ...touch, visitor_id: visitorId };
}

/**
 * The campaign that first brought this browser here, while its claim holds.
 *
 * The expiry is checked on READ, not only on write. Checking it solely in
 * claimFirstTouch() meant the TTL governed replacement and nothing else: a
 * stored claim never lapsed on its own, so the shared-laptop case the TTL
 * exists for still happened unless the next person arrived on a differently
 * tagged link, and an untagged arrival writes nothing by design, which is
 * exactly the arrival a colleague makes.
 */
export function firstTouchAttribution(): FirstTouch | null {
  const stored = readJson<FirstTouch>(localStorage, FIRST_TOUCH_KEY);
  if (!stored) return null;
  if (stored.first_touch_at) {
    const age = Date.now() - Date.parse(stored.first_touch_at);
    if (age > FIRST_TOUCH_TTL_MS) return null;
  }
  return stored;
}

/** Test seam. Clears the module's latch and its in-memory fallbacks. */
export function __resetAttribution(): void {
  captured = false;
  memoryTouch = null;
  memoryVisitorId = null;
}
