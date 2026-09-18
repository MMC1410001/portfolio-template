/**
 * Validation and normalisation for incoming analytics payloads.
 *
 * Everything here treats the input as hostile. `/api/track` is unauthenticated
 * (anonymous visitors are the point) so the body is the one part of a row a
 * caller fully controls, and `props` is the one field whose *shape* they
 * control. The rule throughout is to reject or clamp rather than store a partly
 * valid value, because a truncated object in a JSON column is
 * indistinguishable from real data once written.
 */

import { ALLOWED_EVENTS, POINT_KIND } from './events';
import { SECTION_IDS, MODES, sectionIdFromPath } from './section-catalogue';
import { MAX_CLICK_ID_LEN, normaliseUtmValue } from './normalise';

/** One request can never write more than this, however many it claims. */
export const MAX_BATCH = 50;
export const MAX_PROPS_BYTES = 2_000;
export const MAX_PROPS_KEYS = 20;
/** 6 hours. More than that is a backgrounded tab, not attention. */
export const MAX_DURATION_MS = 21_600_000;
/** The whole request body. Generous for a 50-event batch, mean for anything else. */
export const MAX_BODY_BYTES = 32_768;

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLICK_ID_RE = /^[A-Za-z0-9_.-]+$/;

export interface IncomingEvent {
  event?: unknown;
  path?: unknown;
  seq?: unknown;
  referrer?: unknown;
  props?: unknown;
  viewport_w?: unknown;
  viewport_h?: unknown;
  duration_ms?: unknown;
  point?: unknown;
}

export interface TrackBody {
  session_id?: unknown;
  attribution?: unknown;
  event?: unknown;
  path?: unknown;
  referrer?: unknown;
  props?: unknown;
  events?: unknown;
}

/** Keeps a forged header or a very long URL from bloating a row. */
export function clamp(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || !value) return null;
  return value.slice(0, max);
}

/** Non-negative integers only; anything else becomes null, not a bad row. */
export function clampInt(value: unknown, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  if (n < 0) return null;
  return Math.min(n, max);
}

/** A 0-1 coordinate. Out-of-range values are clamped, not rejected. */
export function clampPct(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, Number(value.toFixed(5))));
}

/**
 * Accept a props object only if it is small and shallow.
 *
 * Nested objects and arrays are dropped whole rather than truncated: nesting
 * is how a byte cap gets defeated, and nothing reading this column needs it.
 */
export function sanitiseProps(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const entries = Object.entries(value as Record<string, unknown>).slice(
    0,
    MAX_PROPS_KEYS,
  );
  const out: Record<string, unknown> = {};

  for (const [key, raw] of entries) {
    if (typeof raw === 'string') out[key] = raw.slice(0, 300);
    else if (typeof raw === 'number' || typeof raw === 'boolean' || raw === null) {
      out[key] = raw;
    }
  }

  if (Object.keys(out).length === 0) return null;
  return JSON.stringify(out).length > MAX_PROPS_BYTES ? null : out;
}

/**
 * A campaign value, or null. Rejects. Never truncates.
 *
 * ── Why this delegates rather than re-implementing ─────────────────────────
 * It used to be a second implementation of the client's rule, and a unit test
 * caught them disagreeing: `_promo` became `promo` on the client and `null`
 * here, because this side validated a leading-underscore away instead of
 * stripping it first. That is precisely the drift the source system documents
 * a campaign that "appeared in GA4 and was missing from /admin, with no
 * error on either side".
 *
 * Both ends now run the same function, so they cannot drift. It is still
 * called on the server for the reason the duplicate existed: the endpoint is
 * open, so the browser is not the only possible caller.
 */
export function normaliseUtm(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return normaliseUtmValue(value);
}

/**
 * Whitelist the campaign block that rides alongside session_id.
 *
 * Per-field: one bad value must not cost the others, because a report split by
 * source is still useful when utm_term happened to be junk. All-null returns
 * null so the row keeps its columns empty rather than storing a shell object.
 */
export function sanitiseAttribution(
  value: unknown,
): Record<string, string | null> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const a = value as Record<string, unknown>;
  const source = typeof a.click_id_source === 'string' ? a.click_id_source : '';
  const clickId =
    typeof a.click_id === 'string' &&
    a.click_id.length <= MAX_CLICK_ID_LEN &&
    CLICK_ID_RE.test(a.click_id)
      ? a.click_id
      : null;
  // An id with no network, or a network with no id, is half a fact. Neither
  // half can be read without the other, so both go.
  const paired = clickId !== null && (source === 'gclid' || source === 'fbclid');

  const row = {
    utm_source: normaliseUtm(a.utm_source),
    utm_medium: normaliseUtm(a.utm_medium),
    utm_campaign: normaliseUtm(a.utm_campaign),
    utm_content: normaliseUtm(a.utm_content),
    utm_term: normaliseUtm(a.utm_term),
    click_id: paired ? clickId : null,
    click_id_source: paired ? source : null,
    // A truncated path is still a usable path, so this one clamps.
    landing_path: clamp(a.landing_path, 512),
    // Same validator as session_id: an arbitrary string would let a caller
    // invent a visitor whose sessions roll up together.
    visitor_id:
      typeof a.visitor_id === 'string' && UUID_RE.test(a.visitor_id)
        ? a.visitor_id
        : null,
  };

  return Object.values(row).some((v) => v !== null) ? row : null;
}

/**
 * Normalise either body shape into a list.
 *
 * Single: `{ session_id, event, path, referrer, props }`: the immediate path
 * Batch:  `{ session_id, events: [ … ] }`,  the queued path
 *
 * `attribution` is deliberately NOT read here. It belongs to the session
 * rather than to any one event, and the single-shape branch silently drops
 * keys it does not name, exactly the trap a top-level campaign field would
 * fall into. The route reads `body.attribution` itself.
 */
export function readEvents(body: TrackBody): IncomingEvent[] {
  if (Array.isArray(body.events)) {
    return body.events.slice(0, MAX_BATCH) as IncomingEvent[];
  }
  return [
    {
      event: body.event,
      path: body.path,
      referrer: body.referrer,
      props: body.props,
    },
  ];
}

export interface ValidatedEvent {
  event: string;
  path: string;
  section: string | null;
  mode: string | null;
  seq: number | null;
  referrer: string | null;
  props: Record<string, unknown> | null;
  viewport_w: number | null;
  viewport_h: number | null;
  duration_ms: number | null;
  point: {
    x_pct: number;
    y_pct: number;
    doc_h: number | null;
    selector: string | null;
    kind: string;
  } | null;
}

/**
 * Validate one incoming event, or null to drop it.
 *
 * `section` and `mode` are read from props but **allowlisted** against the
 * catalogue rather than trusted, which is what stops an open endpoint from
 * inventing sections. `kind` is derived from the validated verb, so a client
 * cannot label a dead click as a real one.
 */
export function validateEvent(raw: IncomingEvent): ValidatedEvent | null {
  const event = typeof raw.event === 'string' ? raw.event : '';
  if (!ALLOWED_EVENTS.has(event)) return null;

  const props = sanitiseProps(raw.props);
  const path = clamp(raw.path, 512) ?? '/';

  // A page_view carries its section in the path (`/#work`); everything else
  // carries it in props.
  const fromPath = sectionIdFromPath(path);
  const fromProps =
    props && typeof props.section === 'string' ? props.section : null;
  const section =
    fromPath ??
    (fromProps && SECTION_IDS.has(fromProps) ? fromProps : null);

  const rawMode = props && typeof props.mode === 'string' ? props.mode : null;
  const mode = rawMode && MODES.has(rawMode) ? rawMode : null;

  const x = clampPct((raw.point as { x_pct?: unknown } | null)?.x_pct);
  const y = clampPct((raw.point as { y_pct?: unknown } | null)?.y_pct);
  const hasPoint = x !== null && y !== null && event in POINT_KIND;

  return {
    event,
    path,
    section,
    mode,
    seq: clampInt(raw.seq, 100_000),
    referrer: clamp(raw.referrer, 1024),
    props,
    viewport_w: clampInt(raw.viewport_w, 20_000),
    viewport_h: clampInt(raw.viewport_h, 20_000),
    duration_ms: clampInt(raw.duration_ms, MAX_DURATION_MS),
    point: hasPoint
      ? {
          x_pct: x,
          y_pct: y,
          doc_h: clampInt(
            (raw.point as { doc_h?: unknown }).doc_h,
            2_000_000,
          ),
          selector: clamp(
            (raw.point as { selector?: unknown }).selector,
            200,
          ),
          kind: POINT_KIND[event],
        }
      : null,
  };
}
