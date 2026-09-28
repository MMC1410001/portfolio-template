/**
 * The event vocabulary, imported by the browser AND by the ingest route.
 *
 * Lumen split this across two files (a TS union in the client, an
 * ALLOWED_EVENTS set in the edge function) and its own ANALYTICS.md records the
 * cost: "a verb missing from the server list is counted as `rejected` and
 * dropped silently, which looks exactly like broken code." One file, both
 * sides, and that class of bug cannot happen here.
 *
 * Dropped from the source system: kundali_generated, payment_started,
 * signed_in, field_focus. There are no accounts, no checkout, and the only
 * form on the site is the chat's single input, a per-field funnel over one
 * field is noise, and the question it would answer (where does the flow stall)
 * is the chat_open -> chat_ask gap instead.
 */

/** Every verb the ingest route will accept. Anything else is dropped. */
export type AnalyticsEvent =
  | 'visit'
  | 'page_view'
  | 'session_end'
  | 'click'
  /** A click that hit nothing interactive, where people expect a control. */
  | 'dead_click'
  /** Repeated clicks in one spot in quick succession, frustration. */
  | 'rage_click'
  /** A 25/50/75/100% scroll milestone, once each per session. */
  | 'scroll_depth'
  /** A tagged CTA became genuinely visible, the denominator for its clicks. */
  | 'cta_view'
  /** Résumé <-> immersive. Mode is a second layout, not a footnote. */
  | 'mode_change'
  | 'chat_open'
  | 'chat_ask'
  | 'chat_answer'
  | 'chat_close'
  | 'error';

export const ALLOWED_EVENTS: ReadonlySet<string> = new Set<AnalyticsEvent>([
  'visit',
  'page_view',
  'session_end',
  'click',
  'dead_click',
  'rage_click',
  'scroll_depth',
  'cta_view',
  'mode_change',
  'chat_open',
  'chat_ask',
  'chat_answer',
  'chat_close',
  'error',
]);

/**
 * The `props` keys each verb may carry. Anything else is dropped at ingest.
 *
 * Here, beside the verb list, so adding a verb stays a one-file change: the
 * `satisfies` below makes a verb with no entry a type error rather than a verb
 * whose every prop is silently discarded. The same trap applies to a new prop
 * on an existing verb, which is why each list was taken from the call sites
 * that queue it (clicks.ts, sections.ts, scroll.ts, cta.ts, mode.ts, chat.ts,
 * tag.ts, queue.ts's session_end hooks, session.ts's visit, and the two
 * `queueEvent` calls in ImmersiveSystem.tsx). A key added there and not here
 * reaches the server and is thrown away, with no error at either end.
 *
 * `section` and `mode` are allowed on every verb: validateEvent reads both
 * into their own columns, allowlisted against the catalogue.
 *
 * `click` is the loose one. trackTag() spreads its caller's props onto the row
 * (FigureTurntable's `frames` today), so a new trackTag caller with a new key
 * needs that key listed here.
 */
const COMMON_PROPS = ['section', 'mode'] as const;

const PROPS_BY_VERB = {
  visit: ['reduced_motion'],
  page_view: ['from', 'to', 'doc_h', 'terminal'],
  session_end: [
    'exit_section', 'resume_ms', 'immersive_ms', 'mode_changes',
    'max_scroll_px', 'doc_h',
  ],
  click: ['selector', 'text', 'tag', 'sampled', 'synthetic', 'frames'],
  dead_click: ['selector', 'tag'],
  rage_click: ['selector', 'dead'],
  scroll_depth: ['depth', 'doc_h'],
  cta_view: ['tag'],
  // `reduced_motion` from use-mode-tracking.ts, `reduced` from the
  // ImmersiveSystem mount row. Two spellings of one fact, both in the log.
  mode_change: ['from', 'to', 'trigger', 'dwell_ms', 'reduced_motion', 'reduced'],
  chat_open: ['trigger'],
  chat_ask: ['q', 'q_len', 'rejected', 'prompt_index', 'turn'],
  chat_answer: [
    'source', 'answer_mode', 'offline', 'failure', 'status', 'latency_ms',
    'has_href', 'answer_len', 'turn',
  ],
  chat_close: ['asked', 'answered', 'dwell_ms', 'last_source'],
  error: ['scope'],
} as const satisfies Record<AnalyticsEvent, readonly string[]>;

export const ALLOWED_PROPS: Readonly<Record<string, ReadonlySet<string>>> =
  Object.fromEntries(
    Object.entries(PROPS_BY_VERB).map(([verb, keys]) => [
      verb,
      new Set<string>([...COMMON_PROPS, ...keys]),
    ]),
  );

/**
 * Which verbs carry a coordinate, and what kind of point it is.
 *
 * Derived from the *validated* verb server-side, exactly as Lumen does it,
 * so a client cannot label a dead click as a real one and warp the heatmap.
 */
export const POINT_KIND: Readonly<Record<string, 'click' | 'dead' | 'rage'>> = {
  click: 'click',
  dead_click: 'dead',
  rage_click: 'rage',
};

/** A click's position, normalised so a phone and a desktop are comparable. */
export interface ClickPoint {
  x_pct: number;
  y_pct: number;
  selector: string | null;
  /**
   * The document height y_pct is a fraction OF, in CSS pixels.
   *
   * Without it a fraction is uninterpretable: the heatmap has to multiply it
   * by some height, and the only one it knows is its own iframe's, a
   * different page state to the visitor's. Carrying the divisor lets the panel
   * place the click at its real depth. Matters far more here than in the
   * source system, because one `<details>` opening changes scrollHeight by
   * thousands of pixels mid-session.
   */
  doc_h?: number;
}

export interface QueuedEvent {
  event: AnalyticsEvent;
  path: string;
  /**
   * Ordering tie-breaker.
   *
   * The ingest route writes a whole batch in one statement, so every row in it
   * shares a `created_at` to the millisecond. Anything deriving order from
   * timestamps alone would shuffle rows inside a batch. `created_at` stays
   * server-authoritative; this only disambiguates rows that already tie.
   */
  seq?: number;
  referrer: string | null;
  props?: Record<string, unknown>;
  viewport_w?: number;
  viewport_h?: number;
  duration_ms?: number;
  point?: ClickPoint;
}

/**
 * Conversion tags, the closest thing this site has to a checkout.
 *
 * Lumen's funnel ended at `payment_completed`. A portfolio's conversion is
 * "did they try to reach me", and that is expressed by *which tag* was clicked
 * rather than by its own verb. Kept here rather than in the SQL because
 * `lib/analytics/sql.ts` interpolates these lists into the session CTE, one
 * source of truth, so a renamed tag cannot silently empty a funnel step.
 *
 * Safe to interpolate: every value is a hand-written `[a-z0-9-]` literal, not
 * anything a visitor can influence.
 */
export const CONVERSION_TAGS = {
  contact: ['contact-email', 'hero-email', 'chat-email'],
  // `resume-pdf-hero` was emitted by the hero's availability line from the
  // start and never listed here, so every download from the most-seen link on
  // the page fell outside the funnel it was measuring. Listing it does not
  // rewrite history, the rows were always there, they just were not counted.
  resume: [
    'resume-pdf-aside',
    'resume-pdf-hero',
    'resume-pdf-header',
    'contact-pdf',
  ],
  outbound: [
    'contact-github',
    'contact-linkedin',
    'contact-twitter',
    'contact-instagram',
    'hero-github',
    'hero-linkedin',
    'hero-twitter',
    'hero-instagram',
    'header-github',
    'header-linkedin',
    'header-twitter',
    'header-instagram',
  ],
} as const;

/** Longest value kept for a click/CTA tag. Rejected past this, not truncated. */
export const MAX_TAG_LEN = 40;
