/**
 * Pure value normalisers, shared by the browser and the ingest route.
 *
 * HARD CONSTRAINT: no DOM reference at module scope or inside any exported
 * function. This is the unit-test target, `tests/analytics.test.ts` imports it
 * in a bare Node process, and a single `window` would make that impossible.
 * Anything needing a document belongs in clicks.ts / sections.ts instead.
 */

import { MAX_TAG_LEN } from './events';

/**
 * Anything that looks like it identifies a person rather than an advert.
 *
 * Ported verbatim from Lumen. Mail-merged links are the real case
 * (`utm_content=ravi@gmail.com`), and now so is a visitor typing "email me at
 * x@y.com" into the chat box. Such a value is dropped **whole** rather than
 * scrubbed, because a scrubbed one still reads as a plausible campaign name, 
 * or a plausible question, and nobody would ever notice what it had been.
 */
export const LOOKS_LIKE_PII = /@|%40|\d{7,}/;

/** People paste links: their own JD, their own profile. Not ours to keep. */
export const LOOKS_LIKE_URL = /https?:\/\/|www\./i;

export const MAX_UTM_LEN = 64;
export const MAX_CLICK_ID_LEN = 128;
export const MAX_QUESTION_LEN = 120;

/** Trailing-slash strip. No dynamic routes exist here, so nothing collapses. */
export function normalisePath(pathname: string): string {
  if (!pathname) return '/';
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Collapse whitespace so "Explore  my\n work" is one stable string. */
export function normaliseText(
  value: string | null | undefined,
  max = 60,
): string | null {
  if (!value) return null;
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat ? flat.slice(0, max) : null;
}

/**
 * A `data-track-*` value: lowercase, hyphenated, `[a-z0-9-]`, <= MAX_TAG_LEN.
 *
 * Rejected over-length rather than truncated, for Lumen's reason: a clipped
 * name is a *different* name and would quietly become a second row that looks
 * real.
 */
export function normaliseTag(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/[\s+_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!value || value.length > MAX_TAG_LEN) return null;
  return value;
}

/**
 * Lowercase, hyphenated, `[a-z0-9._-]`, <= 64 chars, or null.
 *
 * Lowercasing is why our reports do not split `Whatsapp` / `whatsapp` /
 * `WhatsApp` into three campaigns. The leading-underscore strip is not
 * cosmetic: in the source system `_promo` survived on the client and was
 * dropped by the server, so the campaign appeared in one report and was
 * missing from the other, with no error on either side. Both ends run this.
 */
export function normaliseUtmValue(raw: string | null): string | null {
  if (!raw) return null;
  if (LOOKS_LIKE_PII.test(raw)) return null;

  const value = raw
    .trim()
    .toLowerCase()
    // URLSearchParams already decodes `+` to a space; both become a hyphen so
    // `Community+message` and `Community message` land on the same row.
    .replace(/[\s+]+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '');

  if (!value || value.length > MAX_UTM_LEN) return null;
  return value;
}

/** Ad click ids are case-significant, so this validates rather than folds. */
export function isValidClickId(raw: string | null): boolean {
  if (!raw) return false;
  return raw.length <= MAX_CLICK_ID_LEN && /^[A-Za-z0-9_.-]+$/.test(raw);
}

export type QuestionRejection = 'pii' | 'url' | 'length' | 'short' | null;

/**
 * A visitor-typed question, made safe to store, or refused.
 *
 * The load-bearing rule: **rejecting the text must never reject the event.**
 * The caller still records the question's length, its answer source and the
 * rejection reason, so volume, guard-hit rate and the offline-fallback rate
 * survive intact and `count(rejected='pii')` becomes a privacy metric of its
 * own. Only the words go.
 *
 * No special case for questions matching content/faq.ts's `sensitive` guard: a
 * probe for "api keys" is adversarial, not the visitor's own PII, and its text
 * is the most valuable thing in the log.
 */
export function normaliseQuestion(raw: string): {
  q: string | null;
  rejected: QuestionRejection;
} {
  if (LOOKS_LIKE_PII.test(raw)) return { q: null, rejected: 'pii' };
  if (LOOKS_LIKE_URL.test(raw)) return { q: null, rejected: 'url' };

  const value = raw
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 '?.,-]/g, '');

  if (value.length > MAX_QUESTION_LEN) return { q: null, rejected: 'length' };
  if (value.length < 3) return { q: null, rejected: 'short' };
  return { q: value, rejected: null };
}

/**
 * Normalise a click to 0-1 of the page box it was given.
 *
 * Which box to divide by is the caller's decision and it is not obvious. See
 * `pointFor()` in clicks.ts for why the width is the layout viewport while the
 * height is the full scroll height.
 */
export function normalisePoint(
  pageX: number,
  pageY: number,
  docWidth: number,
  docHeight: number,
): { x_pct: number; y_pct: number } {
  const clamp = (n: number) =>
    Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
  return {
    x_pct: Number(clamp(pageX / Math.max(docWidth, 1)).toFixed(5)),
    y_pct: Number(clamp(pageY / Math.max(docHeight, 1)).toFixed(5)),
  };
}
