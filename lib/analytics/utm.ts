/**
 * Campaign attribution, which link brought this person here.
 *
 * Two stores, each answering a different question:
 *
 *   pfVisitorId   localStorage    which browser is this (across sessions)
 *   pfLastTouch   sessionStorage  which campaign started THIS session
 *
 * There used to be a third, `pfFirstTouch`: the campaign that first acquired
 * the browser, kept in localStorage for 90 days. Nothing ever read it (it was
 * never sent, and no panel asked for it) and /privacy did not disclose it, so
 * it was a 90-day record of where someone came from, held for no purpose. It
 * is no longer written, and captureAttribution() deletes any left behind.
 * Acquisition is still answerable server-side, from the earliest `visit` row
 * carrying the visitor id.
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
const LAST_TOUCH_KEY = 'pfLastTouch';
/** Retired, see the header. Named only so it can be deleted. */
const RETIRED_FIRST_TOUCH_KEY = 'pfFirstTouch';

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

function removeStore(store: Storage, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    /* private mode, nothing was stored to begin with */
  }
}

/**
 * Read the campaign off this page load. Call once, before anything renders.
 *
 * An **untagged** load deliberately does nothing beyond minting the visitor id:
 * it must not clear the session's last touch, which a tagged landing followed
 * by an untagged reload would otherwise lose.
 */
export function captureAttribution(): void {
  if (captured) return;
  captured = true;

  // Before the suppression check: deleting a retired record is owed to an
  // opted-out browser as much as to anyone.
  if (typeof localStorage !== 'undefined') {
    removeStore(localStorage, RETIRED_FIRST_TOUCH_KEY);
  }

  try {
    if (trackingSuppressed()) return;

    const params = new URLSearchParams(window.location.search);
    const touch = readTouch(params);
    const visitorId = ensureVisitorId();
    if (!touch) return;

    const withVisitor: Attribution = { ...touch, visitor_id: visitorId };
    memoryTouch = withVisitor;
    writeStore(sessionStorage, LAST_TOUCH_KEY, JSON.stringify(withVisitor));
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
 * Forget this browser: the visitor id, the tab's campaign, and the in-memory
 * copies of both. Called when the visitor opts out on /privacy.
 *
 * Without it, opting out stopped the recording but kept the id, so turning
 * measurement back on joined the new visits to the old ones, which is the one
 * thing someone who switched it off would not expect. The memory copies matter
 * too: ensureVisitorId() falls back to `memoryVisitorId` when storage reads
 * empty, which would hand the deleted id straight back on this page load.
 */
export function forgetAttribution(): void {
  memoryTouch = null;
  memoryVisitorId = null;
  if (typeof localStorage !== 'undefined') {
    removeStore(localStorage, VISITOR_ID_KEY);
    removeStore(localStorage, RETIRED_FIRST_TOUCH_KEY);
  }
  if (typeof sessionStorage !== 'undefined') {
    removeStore(sessionStorage, LAST_TOUCH_KEY);
  }
}

/** Test seam. Clears the module's latch and its in-memory fallbacks. */
export function __resetAttribution(): void {
  captured = false;
  memoryTouch = null;
  memoryVisitorId = null;
}
