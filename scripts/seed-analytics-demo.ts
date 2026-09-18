/**
 * Generate the sample dataset behind the public showcase at `/analytics`.
 *
 *   npm run seed:demo
 *
 * ── Why generated, not hand-written ────────────────────────────────────────
 * The showcase renders the *same* panel components `/admin` renders. If their
 * data came from a hand-authored fixture, the fixture would drift the moment a
 * query changed, and it would drift silently, because a plausible number is
 * indistinguishable from a correct one until someone checks the SQL by hand.
 *
 * So this script builds synthetic *events*, pushes them through the real
 * `validateEvent` → `buildRows` → `writeBatch` path into a throwaway SQLite
 * database carrying the real schema, then runs the real `overview()`,
 * `audience()`, `campaigns()`, `chatStats()`, `clickMap()` and
 * `listSessions()` against it. What lands in `content/analytics-demo.json` is
 * production output. Change a query and re-run: the showcase follows.
 *
 * Routing the synthetic events through `validateEvent` is not ceremony. It is
 * the check that this file cannot invent data the live endpoint would refuse, 
 * an unknown section, a verb outside the allowlist, an oversized props blob.
 * The script asserts nothing was dropped, so such a mistake fails the build
 * instead of producing a showcase of impossible traffic.
 *
 * ── Why the numbers are fabricated, and why that is the right call ─────────
 * Real visitor data cannot go on a public page. `/admin` shows verbatim
 * chatbot questions and a per-session table carrying city, ASN organisation
 * and a network prefix, at portfolio traffic volumes that combination
 * identifies people, and the ASN is often an employer. Publishing it would
 * also contradict `/privacy`, which visitors read on the understanding that
 * the operator is the audience.
 *
 * Synthetic data has a second, less obvious advantage: it is *legible*. A real
 * 30-day window on a new portfolio is mostly zeroes, and an empty funnel
 * demonstrates nothing about the funnel.
 *
 * ── Determinism ────────────────────────────────────────────────────────────
 * A seeded PRNG, so re-running with an unchanged `ANCHOR` and `SEED` produces
 * a byte-identical file and an empty diff. Without that, every run would
 * rewrite the committed JSON and the history would be noise.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDemoDatabase } from './d1-sqlite';
import { SCHEMA_STATEMENTS, RETENTION_DAYS } from '../lib/analytics/schema';
import { validateEvent, type IncomingEvent } from '../lib/analytics/payload';
import { buildRows, writeBatch } from '../lib/analytics/ingest';
import {
  overview,
  audience,
  campaigns,
  chatStats,
  clickMap,
  listSessions,
  type QueryOptions,
} from '../lib/analytics/queries';
import { istDayKey, IST_OFFSET_MS } from '../lib/analytics/time';
import type {
  Audience,
  Campaigns,
  ChatStats,
  ClickMap,
  Overview,
  SessionRow,
} from '../lib/analytics/types';
import { SECTIONS } from '../lib/analytics/section-catalogue';

/* ─────────────────────────── knobs ─────────────────────────── */

/**
 * The sample's end date, as an IST day key.
 *
 * Fixed rather than `Date.now()` so the committed JSON is stable and the page
 * can state exactly which window it is showing. The showcase labels its range
 * presets relative to this date instead of claiming "last 7 days", which would
 * be a lie the moment the file is a week old.
 */
const ANCHOR = '2026-09-09';
const SEED = 20260909;

/**
 * 120 days generated, 90 the widest window offered.
 *
 * The 30-day head start is not padding. `audience()`'s new-vs-returning split
 * asks `EXISTS (… created_at < window.since)`, so a visitor counts as
 * returning only if they have activity *before* the window opens. Generate
 * exactly 90 days and offer a 90-day range and every visitor is necessarily
 * new, the panel would read "0 returning" and look broken, when in truth the
 * window simply contained all of history.
 *
 * The validator below caught this; it is the reason the check exists.
 */
const DAYS = 120;

/** Precomputed payloads the showcase can switch between, in days. */
const RANGES = [7, 30, 90] as const;

/** Rows in the sessions table. Enough to show the shape, not a data dump. */
const SESSION_ROWS = 30;

const OUT = resolve(import.meta.dirname, '../content/analytics-demo.json');

/* ─────────────────────────── PRNG ─────────────────────────── */

/** mulberry32: small, fast, and adequate for shaping fake traffic. */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = makeRandom(SEED);

const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
const intBetween = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));
const chance = (p: number) => rnd() < p;

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length)];
}

/** A legal 0-1 coordinate. `clampPct` would accept more, but not usefully. */
const clamp01 = (v: number) => Math.min(0.999, Math.max(0.001, v));

/** Weighted pick. Weights need not sum to 1. */
function weighted<T>(entries: readonly [T, number][]): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rnd() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

/** A deterministic v4-shaped uuid, `UUID_RE` in payload.ts must accept it. */
function uuid(): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 32; i += 1) {
    if (i === 12) out += '4';
    else if (i === 16) out += hex[8 + Math.floor(rnd() * 4)];
    else out += hex[Math.floor(rnd() * 16)];
  }
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`;
}

/* ─────────────────────── the population ─────────────────────── */

const DEVICES = [
  ['desktop', 55],
  ['mobile', 40],
  ['tablet', 5],
] as const satisfies readonly [string, number][];

/** Browser/OS pairs that actually co-occur. A Safari-on-Windows row is a tell. */
const STACKS: Record<string, readonly [[string, string], number][]> = {
  desktop: [
    [['Chrome', 'macOS'], 26],
    [['Chrome', 'Windows'], 30],
    [['Safari', 'macOS'], 18],
    [['Firefox', 'Windows'], 8],
    [['Edge', 'Windows'], 12],
    [['Chrome', 'Linux'], 6],
  ],
  mobile: [
    [['Safari', 'iOS'], 42],
    [['Chrome', 'Android'], 46],
    [['Chrome', 'iOS'], 12],
  ],
  tablet: [
    [['Safari', 'iPadOS'], 70],
    [['Chrome', 'Android'], 30],
  ],
};

const VIEWPORTS: Record<string, readonly [number, number][]> = {
  desktop: [
    [1512, 860],
    [1920, 1080],
    [1440, 810],
    [2560, 1400],
    [1366, 768],
  ],
  mobile: [
    [390, 844],
    [412, 915],
    [360, 800],
    [430, 932],
  ],
  tablet: [
    [820, 1180],
    [1024, 1366],
  ],
};

/**
 * Geography, weighted towards Austin because that is where the author is and
 * therefore where the network effect is.
 *
 * `asnOrg` is a consumer ISP or a cloud host in every row. Deliberately never
 * a company name: on the real panel this field frequently *is* the visitor's
 * employer, which is exactly the identifying detail that keeps the live panel
 * private. A showcase should not model the shape of a leak.
 */
const PLACES = [
  [['Austin', 'Maharashtra', 'IN', 'Reliance Jio Infocomm'], 26],
  [['Pune', 'Maharashtra', 'IN', 'Bharti Airtel'], 9],
  [['Bengaluru', 'Karnataka', 'IN', 'ACT Fibernet'], 11],
  [['Delhi', 'Delhi', 'IN', 'Bharti Airtel'], 7],
  [['Hyderabad', 'Telangana', 'IN', 'Reliance Jio Infocomm'], 5],
  [['Chennai', 'Tamil Nadu', 'IN', 'Bharti Airtel'], 4],
  [['Ahmedabad', 'Gujarat', 'IN', 'Reliance Jio Infocomm'], 3],
  [['San Francisco', 'California', 'US', 'Comcast Cable'], 6],
  [['New York', 'New York', 'US', 'Verizon Fios'], 5],
  [['Seattle', 'Washington', 'US', 'Amazon Data Services'], 3],
  [['London', 'England', 'GB', 'BT Group'], 5],
  [['Berlin', 'Berlin', 'DE', 'Deutsche Telekom'], 3],
  [['Amsterdam', 'North Holland', 'NL', 'Hetzner Online'], 2],
  [['Singapore', null, 'SG', 'Singtel'], 3],
  [['Toronto', 'Ontario', 'CA', 'Rogers Communications'], 2],
  [['Dubai', 'Dubai', 'AE', 'Emirates Telecom'], 2],
  [['Sydney', 'New South Wales', 'AU', 'Telstra'], 2],
] as const satisfies readonly [readonly [string, string | null, string, string], number][];

/**
 * Where sessions arrive from.
 *
 * `referrer` is a full URL because `referrerHost()` derives the host from it
 * and `resolveSource()` groups on that, feeding a bare hostname would take a
 * different code path than production and could hide a bug in either.
 */
const SOURCES = [
  [{ referrer: null, utm: null }, 32],
  [{ referrer: 'https://www.linkedin.com/feed/', utm: null }, 20],
  [{ referrer: 'https://www.google.com/', utm: null }, 13],
  [{ referrer: 'https://github.com/', utm: null }, 8],
  [{ referrer: 'https://chatgpt.com/', utm: null }, 6],
  [{ referrer: 'https://t.co/', utm: null }, 4],
  [{ referrer: 'https://news.ycombinator.com/', utm: null }, 2],
  [
    {
      referrer: 'https://www.linkedin.com/feed/',
      utm: {
        utm_source: 'linkedin',
        utm_medium: 'social',
        utm_campaign: 'agentic-ai-writeup',
        utm_content: 'carousel',
      },
    },
    7,
  ],
  [
    {
      referrer: 'https://mail.google.com/',
      utm: {
        utm_source: 'newsletter',
        utm_medium: 'email',
        utm_campaign: 'sept-roundup',
        utm_content: 'header-link',
      },
    },
    5,
  ],
  [
    {
      referrer: null,
      utm: {
        utm_source: 'resume',
        utm_medium: 'pdf',
        utm_campaign: 'applications',
        utm_content: 'qr-code',
      },
    },
    3,
  ],
] as const satisfies readonly [
  { referrer: string | null; utm: Record<string, string> | null },
  number,
][];

/** Document order, and the share of sessions that get this far. */
const DWELL_SECTIONS = SECTIONS.filter((s) => s.level === 'section');
const BLOCK_SECTIONS = SECTIONS.filter((s) => s.level === 'block');

/** Tags that exist in the markup. An invented tag would be a fake capability. */
const TAGS_BY_SECTION: Record<string, readonly string[]> = {
  hero: [
    'hero-explore-work',
    'hero-email',
    'hero-github',
    'hero-linkedin',
    'hero-scroll-explore',
    'reveal-immersive',
  ],
  work: ['work-all-repos', 'erp-expand'],
  about: ['resume-pdf-aside'],
  skills: [],
  certifications: ['certs-linkedin'],
  notes: [],
  products: [],
  recommendations: ['recommendation-expand'],
  contact: ['contact-email', 'contact-github', 'contact-linkedin', 'contact-pdf'],
};

const CTAS_BY_SECTION: Record<string, readonly string[]> = {
  hero: ['hero-explore-work', 'reveal-immersive', 'chat-open'],
  work: ['erp-expand', 'section-northwind-erp'],
  about: ['resume-pdf-aside'],
  contact: ['contact-email', 'contact-pdf'],
};

/**
 * How likely a tag is to be clicked once its section is on screen.
 *
 * Per-tag rather than one constant, because a single rate produced an
 * incoherent funnel: hero carries three outbound links, so a flat 16% each
 * made `P(at least one)` about 41%, and "reached out" came out at 47% of all
 * sessions while only 3.5% ever reached the contact section. Outbound links in
 * the hero are a real path, but a rare one, someone who clicks LinkedIn from
 * the hero has skipped the portfolio entirely.
 */
const TAG_RATES: Record<string, number> = {
  'hero-explore-work': 0.14,
  'hero-scroll-explore': 0.09,
  'reveal-immersive': 0.11,
  'hero-email': 0.012,
  'hero-github': 0.022,
  'hero-linkedin': 0.03,
  'work-all-repos': 0.06,
  'erp-expand': 0.19,
  'resume-pdf-aside': 0.1,
  'certs-linkedin': 0.05,
  'recommendation-expand': 0.22,
  'contact-email': 0.26,
  'contact-pdf': 0.14,
  'contact-github': 0.11,
  'contact-linkedin': 0.16,
};

/**
 * A stable screen position per tag, so clicks cluster on elements.
 *
 * Without this the heatmap was almost flat, `maxN` of 3 across 233 cells, 
 * because every click got an independently jittered coordinate and the map
 * bins at 40 x-buckets by 24px y-bands. Real clicks pile onto the same button:
 * a heatmap whose whole purpose is showing *where* attention lands must be
 * generated from positions, not from noise.
 *
 * Derived from the tag name so it is deterministic and independent of the
 * order sessions happen to be generated in.
 */
function tagPosition(tag: string): { x: number; yOffset: number } {
  let h = 2166136261;
  for (let i = 0; i < tag.length; i += 1) {
    h ^= tag.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const r = makeRandom(h >>> 0);
  // Buttons live in the middle two thirds; nothing sits at the very edges.
  return { x: 0.2 + r() * 0.58, yOffset: 0.12 + r() * 0.76 };
}

const TAG_POSITIONS = new Map<string, { x: number; yOffset: number }>();
for (const tags of Object.values(TAGS_BY_SECTION)) {
  for (const tag of tags) TAG_POSITIONS.set(tag, tagPosition(tag));
}

/**
 * Typical dwell per section, in seconds, as [min, max].
 *
 * A single range for every section produced an average of ~28s everywhere,
 * which is the tell of generated data: nobody spends as long on a toolkit
 * chip list as on a project write-up.
 */
const DWELL_RANGES: Record<string, readonly [number, number]> = {
  hero: [2, 14],
  work: [8, 95],
  about: [4, 40],
  skills: [2, 18],
  certifications: [3, 30],
  notes: [3, 26],
  products: [5, 55],
  recommendations: [4, 34],
  contact: [3, 22],
};

/** Selectors that plausibly frustrate someone. Both are real elements. */
const DEAD_SELECTORS = [
  'div.project-card',
  'span.skill-chip',
  'div.cert-row',
  'img.portrait',
  'div.metric-tile',
];

/**
 * Chat questions, split by whether `content/faq.ts` has an answer.
 *
 * The unmatched list is the panel's whole point, every row is a question to
 * go and write an answer for, so the sample has to contain some.
 */
const MATCHED_QUESTIONS = [
  'what does he do at northwind',
  'is he available for a new role',
  'what is his experience with playwright',
  'tell me about the northwind erp project',
  'what certifications does he have',
  'does he know python',
  'what is his notice period',
  'where is he based',
  'what does he use for rag evals',
  'has he worked with cloudflare workers',
  'what is taxwise',
  'how many years of experience',
  'what is his tech stack',
  'can i see his resume',
  'does he do api automation testing',
];

const UNMATCHED_QUESTIONS = [
  'what is his current ctc',
  'can he relocate to bangalore',
  'does he freelance on weekends',
  'what did he score in college',
  'is he open to a founding engineer role',
  'does he know kubernetes',
  'what is his github contribution streak',
  'has he ever managed a team',
];

/**
 * The `source` strings the chat actually reports.
 *
 * These are matched by *exact string* in `chatStats`: `'Not documented'` is
 * the coverage gap, and `'Safety boundary'`, `'Portfolio guide'` and
 * `'Out of scope'` are the guard hits. A near-miss like "Not documented yet" produces a zero rather
 * than an error, which is precisely how a wrong constant survives review.
 */
const CHAT_SOURCES = [
  ['From the portfolio', 66],
  ['Offline · from the portfolio', 11],
  ['Answered with AI assistance', 23],
] as const satisfies readonly [string, number][];

/** What the query counts as the coverage gap. Exact string, deliberately. */
const GAP_SOURCE = 'Not documented';

/** Guard sources: a question deflected before it reaches the answer set. */
const GUARD_SOURCES = ['Safety boundary', 'Portfolio guide', 'Out of scope'] as const;

/** Questions that trip a guard rather than reaching the answer set. */
const GUARDED_QUESTIONS = [
  'what is his password',
  'give me his client list',
  'share the internal api keys',
  'what is the weather in mumbai',
  'write me a poem',
  'is he married',
  'what caste is he',
];

const CHAT_FAILURES = [
  ['none', 88],
  ['timeout', 5],
  ['http', 4],
  ['network', 3],
] as const satisfies readonly [string, number][];

/* ─────────────────────── event construction ─────────────────────── */

interface Stamped {
  at: number;
  incoming: IncomingEvent;
}

interface SessionPlan {
  sessionId: string;
  visitorId: string;
  startedAt: number;
  device: string;
  browser: string;
  os: string;
  viewport: readonly [number, number];
  geo: {
    country: string | null;
    region: string | null;
    city: string | null;
    asnOrg: string | null;
  };
  ipHash: string;
  ipPrefix: string;
  isInternal: boolean;
  attribution: Record<string, string | null> | null;
  events: Stamped[];
}

/** 64 hex chars, matching the real SHA-256 output width. */
function fakeIpHash(): string {
  let out = '';
  for (let i = 0; i < 64; i += 1) out += '0123456789abcdef'[Math.floor(rnd() * 16)];
  return out;
}

/**
 * The document height a session sees, in px.
 *
 * Mobile pages are far taller than desktop ones for the same content, and the
 * heatmap's y axis is a fraction of this, so a single constant would put
 * mobile and desktop clicks in the wrong bands relative to each other.
 */
function docHeightFor(device: string): number {
  if (device === 'mobile') return intBetween(15_000, 19_000);
  if (device === 'tablet') return intBetween(11_000, 13_500);
  return intBetween(8_400, 10_200);
}

/**
 * Build one session's worth of events.
 *
 * Ordering matters: `visit` first (it is the row attribution is stamped on),
 * `session_end` last (its duration is the session's). In between, events carry
 * increasing timestamps so `firstNonNull`/`lastNonNull` in sql.ts, which
 * order by `created_at`: resolve to the values a real session would produce.
 */
function planSession(startedAt: number, visitorId: string): SessionPlan {
  const device = weighted(DEVICES.map(([d, w]) => [d, w] as [string, number]));
  const [[browser, os]] = [weighted(STACKS[device])];
  const viewport = pick(VIEWPORTS[device]);
  const [city, region, country, asnOrg] = weighted(
    PLACES.map(([p, w]) => [p, w] as [(typeof PLACES)[number][0], number]),
  );
  const source = weighted(
    SOURCES.map(([s, w]) => [s, w] as [(typeof SOURCES)[number][0], number]),
  );
  const isInternal = chance(0.032);

  const docH = docHeightFor(device);
  /**
   * How far this visitor gets.
   *
   * The exponent is the bounce rate in disguise. At 1.55 roughly 96% of
   * sessions came out "engaged" (`section_views > 1 OR duration_ms >= 10s`),
   * which no real portfolio achieves, a first cut that looked fine until the
   * funnel was read next to it. At 2.6 the head of the distribution is heavy
   * enough that a majority of visitors see the hero and leave, which is what
   * actually happens.
   */
  const depth = Math.pow(rnd(), 2.6);
  const reach = Math.max(1, Math.round(depth * DWELL_SECTIONS.length));
  /**
   * Some visitors jump straight to contact.
   *
   * The page has anchor navigation and a hero CTA, so scrolling is not the
   * only route down. Without this, reaching contact required passing all nine
   * sections in order and came out at 1.8% of sessions, while 11% of them
   * "reached out", which is incoherent on its face. A recruiter who lands and
   * jumps to the contact block is a real and important path.
   */
  const jumpsToContact = reach < DWELL_SECTIONS.length && chance(0.055);
  const reached = jumpsToContact
    ? [...DWELL_SECTIONS.slice(0, reach), DWELL_SECTIONS[DWELL_SECTIONS.length - 1]]
    : DWELL_SECTIONS.slice(0, reach);
  const goesImmersive = chance(0.24) && reach >= 2;

  const events: Stamped[] = [];
  let at = startedAt;
  let seq = 0;
  const push = (
    event: string,
    extra: Omit<IncomingEvent, 'event' | 'seq'> = {},
  ) => {
    seq += 1;
    events.push({
      at,
      incoming: {
        event,
        seq,
        viewport_w: viewport[0],
        viewport_h: viewport[1],
        ...extra,
      },
    });
  };

  const referrer = source.referrer;
  push('visit', { path: '/', referrer, props: { reduced_motion: chance(0.06) } });

  let mode = 'resume';
  if (goesImmersive) {
    at += intBetween(6_000, 26_000);
    push('mode_change', {
      path: '/',
      props: {
        from: 'resume',
        to: 'immersive',
        trigger: chance(0.55) ? 'idle' : 'click',
        dwell_ms: at - startedAt,
        mode: 'immersive',
      },
    });
    mode = 'immersive';
  }

  // Sections, in order, each with the dwell that produced its page_view.
  let maxScrollPx = 0;
  const milestonesHit = new Set<number>();
  /**
   * CTA impressions for the WHOLE session, not per section.
   *
   * Session-scoped because that is the grain the query uses: `seenSessions`
   * and `clickedSessions` both count distinct sessions, so an impression in
   * the hero legitimately licenses a click later on, the chat launcher is
   * fixed-position and clickable from anywhere once seen.
   */
  const seenCtas = new Set<string>();
  reached.forEach((section, i) => {
    const [lo, hi] = DWELL_RANGES[section.id] ?? [3, 30];
    // Someone who only ever saw the hero left quickly, pinning that to the
    // same range as an engaged reader is what pushed the engaged share to 96%.
    const bounced = reached.length === 1;
    const dwell = Math.round(
      bounced ? between(900, 9_000) : between(lo * 1_000, hi * 1_000),
    );
    at += dwell;
    const next = reached[i + 1]?.id ?? null;
    const terminal = i === reached.length - 1;
    push('page_view', {
      path: `/#${section.id}`,
      duration_ms: dwell,
      props: {
        from: reached[i - 1]?.id ?? null,
        to: next,
        mode,
        doc_h: docH,
        ...(terminal ? { terminal: true } : {}),
      },
    });

    // Scroll milestones, derived from position in the page rather than rolled
    // independently, a session that reached the contact section cannot
    // plausibly have a 25% max scroll.
    const progress = (i + 1) / DWELL_SECTIONS.length;
    for (const milestone of [25, 50, 75, 100]) {
      if (progress * 100 < milestone || milestonesHit.has(milestone)) continue;
      milestonesHit.add(milestone);
      at += intBetween(300, 1_400);
      push('scroll_depth', {
        path: `/#${section.id}`,
        props: { depth: milestone, doc_h: docH, section: section.id, mode },
      });
    }
    maxScrollPx = Math.max(maxScrollPx, Math.round(docH * progress * 0.94));

    // The two nested blocks produce impressions, not dwell.
    for (const block of BLOCK_SECTIONS) {
      if (section.id !== 'work' || !chance(0.42)) continue;
      at += intBetween(400, 2_000);
      push('cta_view', {
        path: `/#${section.id}`,
        props: { tag: `section-${block.id}`, section: section.id, mode },
      });
    }

    /**
     * CTA impressions, recorded so a click can be gated on one.
     *
     * A `cta_view` fires when the element scrolls into view, so **a click on a
     * tracked CTA is impossible without a prior impression**. Rolling the two
     * independently produced `clickedSessions > seenSessions` on every range,
     * which renders as a click-through rate above 100%, the CTA table's one
     * job is to divide those two numbers, so an incoherent pair there is worse
     * than a missing row. The validator caught this.
     */
    for (const tag of CTAS_BY_SECTION[section.id] ?? []) {
      // Not every CTA in a section enters the viewport: someone can leave
      // mid-section, and the observer only fires for what was actually shown.
      if (!chance(0.72)) continue;
      seenCtas.add(tag);
      at += intBetween(200, 1_100);
      push('cta_view', { path: `/#${section.id}`, props: { tag, section: section.id, mode } });
    }

    // Tagged clicks, at the tag's stable position so they pile up into a
    // readable hotspot. The jitter is a few pixels of finger/cursor spread,
    // not a re-roll of where the element is.
    const sectionTop = i / DWELL_SECTIONS.length;
    const sectionSpan = 1 / DWELL_SECTIONS.length;
    const trackedCtas = CTAS_BY_SECTION[section.id] ?? [];
    for (const tag of TAGS_BY_SECTION[section.id] ?? []) {
      // A tag that is also a tracked CTA can only be clicked if its
      // impression fired. Tags with no CTA tracking are unconstrained, 
      // there is no impression to contradict.
      if (trackedCtas.includes(tag) && !seenCtas.has(tag)) continue;
      if (!chance(TAG_RATES[tag] ?? 0.08)) continue;
      at += intBetween(400, 3_000);
      const pos = TAG_POSITIONS.get(tag) ?? { x: 0.5, yOffset: 0.5 };
      const selector = `a[data-track-tag="${tag}"]`;
      push('click', {
        path: `/#${section.id}`,
        props: { selector, tag, text: tag, sampled: true, section: section.id, mode },
        point: {
          x_pct: clamp01(pos.x + between(-0.012, 0.012)),
          y_pct: clamp01(
            sectionTop + pos.yOffset * sectionSpan + between(-0.0018, 0.0018),
          ),
          doc_h: docH,
          selector,
        },
      });
    }

    // Frustration. Concentrated rather than uniform, because that is how it
    // actually shows up, one non-interactive card people keep tapping.
    if (chance(0.09)) {
      const selector = pick(DEAD_SELECTORS);
      at += intBetween(500, 2_500);
      const rage = chance(0.34);
      // Same treatment as tagged clicks: a dead element sits somewhere
      // specific, and the panel's job is to say where.
      const pos = tagPosition(`${section.id}:${selector}`);
      push(rage ? 'rage_click' : 'dead_click', {
        path: `/#${section.id}`,
        props: { selector, dead: true, section: section.id, mode },
        point: {
          x_pct: clamp01(pos.x + between(-0.02, 0.02)),
          y_pct: clamp01(
            sectionTop + pos.yOffset * sectionSpan + between(-0.003, 0.003),
          ),
          doc_h: docH,
          selector,
        },
      });
    }
  });

  // Chat. Opened by a minority, and of those a majority actually ask.
  const openedChat = chance(0.19) && reach >= 2;
  if (openedChat) {
    const openedAt = at + intBetween(1_000, 8_000);
    at = openedAt;
    const section = pick(reached).id;
    // The launcher is a tagged element, so opening the panel produces a click
    // on `chat-open` as well as the chat_open verb. Without it the CTA table
    // showed `chat-open` with 720 impressions and a 0% click-through, which is
    // not a quiet CTA. It is a missing event.
    //
    // Gated on the impression for the same reason as every other tracked CTA:
    // the launcher has to have been on screen to be clicked.
    if (seenCtas.has('chat-open')) push('click', {
      path: `/#${section}`,
      props: {
        selector: 'button[data-track-tag="chat-open"]',
        tag: 'chat-open',
        text: 'chat-open',
        sampled: false,
        section,
        mode,
      },
    });
    push('chat_open', {
      path: `/#${section}`,
      props: { trigger: chance(0.7) ? 'launcher' : 'cta', section, mode },
    });

    const asks = chance(0.72) ? intBetween(1, 3) : 0;
    let answered = 0;
    for (let turn = 1; turn <= asks; turn += 1) {
      // Three outcomes, in the order the real answerQuestion() resolves them:
      // a guard fires, or nothing matched, or an answer was found.
      const guarded = chance(0.07);
      const unmatched = !guarded && chance(0.22);
      const question = guarded
        ? pick(GUARDED_QUESTIONS)
        : unmatched
          ? pick(UNMATCHED_QUESTIONS)
          : pick(MATCHED_QUESTIONS);
      at += intBetween(3_000, 22_000);
      push('chat_ask', {
        path: `/#${section}`,
        props: {
          q: question,
          q_len: question.length,
          rejected: 'none',
          prompt_index: null,
          turn,
          section,
          mode,
        },
      });

      // A guard short-circuits before the network is touched, so it can be
      // neither offline nor a failure.
      const failure = guarded
        ? 'none'
        : weighted(CHAT_FAILURES.map(([f, w]) => [f, w] as [string, number]));
      const offline = failure !== 'none';
      const matchedSource = offline
        ? 'Offline · from the portfolio'
        : weighted(CHAT_SOURCES.map(([s, w]) => [s, w] as [string, number]));
      const chatSource = guarded
        ? pick(GUARD_SOURCES)
        : unmatched
          ? GAP_SOURCE
          : matchedSource;
      at += intBetween(220, 2_400);
      answered += 1;
      push('chat_answer', {
        path: `/#${section}`,
        // `source` is what the coverage-gap and guard-hit figures read, by
        // exact string match. See GAP_SOURCE.
        props: {
          source: chatSource,
          answer_mode: chatSource === 'Answered with AI assistance' ? 'ai' : 'faq',
          offline,
          failure,
          status: failure === 'http' ? 502 : null,
          // A guard answers from memory; a documented answer is a lookup; the
          // AI path is a round trip. Three visibly different latencies, which
          // is what makes the median worth showing.
          latency_ms: guarded
            ? intBetween(8, 40)
            : offline
              ? intBetween(40, 160)
              : intBetween(280, 2_600),
          has_href: chance(0.4),
          answer_len: intBetween(180, 900),
          turn,
          section,
          mode,
        },
      });
    }

    at += intBetween(1_500, 30_000);
    push('chat_close', {
      path: `/#${section}`,
      props: {
        asked: asks,
        answered,
        dwell_ms: at - openedAt,
        last_source: null,
        section,
        mode,
      },
    });
  }

  // No separate "reaching out" block: the contact section's own tagged
  // clicks above already produce it, via the same CONVERSION_TAGS the funnel
  // reads. An extra emit here double-counted the last funnel step against the
  // CTA table that is supposed to explain it.

  at += intBetween(500, 6_000);
  push('session_end', {
    path: '/',
    duration_ms: at - startedAt,
    props: {
      resume_ms: goesImmersive ? Math.round((at - startedAt) * between(0.2, 0.6)) : at - startedAt,
      immersive_ms: goesImmersive ? Math.round((at - startedAt) * between(0.4, 0.8)) : 0,
      mode_changes: goesImmersive ? 1 : 0,
      max_scroll_px: maxScrollPx,
      exit_section: reached[reached.length - 1]?.id ?? null,
      doc_h: docH,
    },
  });

  const octet = intBetween(1, 254);
  return {
    sessionId: uuid(),
    visitorId,
    startedAt,
    device,
    browser,
    os,
    viewport,
    geo: { country, region, city, asnOrg },
    ipHash: fakeIpHash(),
    ipPrefix: `${intBetween(2, 223)}.${intBetween(0, 255)}.${octet}.0/24`,
    isInternal,
    attribution: source.utm
      ? {
          ...source.utm,
          utm_term: null,
          click_id: null,
          click_id_source: null,
          landing_path: '/',
          visitor_id: visitorId,
        }
      : { visitor_id: visitorId, landing_path: '/' },
    events,
  };
}

/* ─────────────────────── the timeline ─────────────────────── */

/** IST midnight for a day key, as an epoch ms value. */
function dayStartMs(key: string): number {
  return Date.parse(`${key}T00:00:00Z`) - IST_OFFSET_MS;
}

/**
 * Sessions per day: a growth trend, a weekday/weekend rhythm, and one spike.
 *
 * The spike is the point of including it, a flat series makes the daily chart
 * decorative, and a real portfolio's traffic is almost entirely "someone
 * posted a link once".
 */
function sessionsOn(dayIndex: number): number {
  /**
   * The base rate had to go up, and the validator is why.
   *
   * At 7-16 sessions/day the 7-day window held ~130 sessions, and three
   * figures came out as a legitimate zero: no guard-tripping question, no
   * abandoned panel, and a heatmap whose busiest cell had 3 clicks. All three
   * are *honest* for a week that quiet, and all three read to a visitor as a
   * broken panel. 16-38/day is a plausible rate for someone posting their work
   * regularly, and it makes every window legible.
   */
  const growth = 16 + (dayIndex / DAYS) * 22;
  const at = dayStartMs(ANCHOR) - (DAYS - 1 - dayIndex) * 86_400_000;
  const weekday = new Date(at + IST_OFFSET_MS).getUTCDay();
  const rhythm = weekday === 0 || weekday === 6 ? 0.58 : 1.16;
  const spike = dayIndex === DAYS - 23 ? 4.4 : dayIndex === DAYS - 22 ? 2.1 : 1;
  return Math.max(1, Math.round(growth * rhythm * spike * between(0.7, 1.3)));
}

async function seed(db: D1Database): Promise<number> {
  // A pool of returning visitors, so `new vs returning` is not all-new.
  const returningPool: string[] = [];
  let sessions = 0;
  // Drawn up front so the chat_health loop below reuses the same per-day
  // counts rather than re-rolling and producing request totals that
  // contradict the session totals on the same day.
  const perDay = Array.from({ length: DAYS }, (_, day) => sessionsOn(day));
  const eventRows: Parameters<typeof writeBatch>[1][number][] = [];
  const pointRows: Parameters<typeof writeBatch>[2][number][] = [];

  for (let day = 0; day < DAYS; day += 1) {
    const base = dayStartMs(ANCHOR) - (DAYS - 1 - day) * 86_400_000;
    // Evaluated ONCE. As a loop condition this re-rolled the PRNG on every
    // iteration, so the day's session count was a random walk against a
    // moving target rather than a count, and because it also shifted the
    // shared random stream, it skewed session *content* by day. The tell was
    // a median session duration that went 30s / 40s / 20s across the 7-, 30-
    // and 90-day windows, which a stationary generator cannot produce.
    const count = perDay[day];
    for (let i = 0; i < count; i += 1) {
      // Waking hours in IST, with a long tail for the overseas slice.
      const hour = weighted([
        [9, 6], [10, 9], [11, 10], [12, 8], [13, 7], [14, 8], [15, 9],
        [16, 10], [17, 11], [18, 12], [19, 12], [20, 11], [21, 9], [22, 7],
        [23, 4], [0, 3], [1, 2], [2, 1], [7, 3], [8, 5],
      ] as const satisfies readonly [number, number][]);
      const startedAt = base + hour * 3_600_000 + intBetween(0, 3_599_000);

      const reuse = returningPool.length > 0 && chance(0.21);
      const visitorId = reuse ? pick(returningPool) : uuid();
      if (!reuse && chance(0.3)) returningPool.push(visitorId);

      const plan = planSession(startedAt, visitorId);
      sessions += 1;

      for (const { at, incoming } of plan.events) {
        const validated = validateEvent(incoming);
        // The assertion is the point of routing through validateEvent at all:
        // a dropped event means this generator produced something the live
        // endpoint would refuse, and the showcase must not display that.
        if (!validated) {
          throw new Error(
            `validateEvent rejected a generated event: ${JSON.stringify(incoming).slice(0, 200)}`,
          );
        }
        const built = buildRows([validated], {
          sessionId: plan.sessionId,
          visitorId: plan.visitorId,
          ua: { device: plan.device, browser: plan.browser, os: plan.os },
          ipHash: plan.ipHash,
          ipPrefix: plan.ipPrefix,
          isInternal: plan.isInternal,
          geo: plan.geo,
          attribution: plan.attribution,
          now: at,
        });
        eventRows.push(...built.eventRows);
        pointRows.push(...built.pointRows);
      }
    }
  }

  // Chunked because the insert serialises the whole array into one JSON bound
  // parameter, and a single multi-megabyte string is slower than five.
  const CHUNK = 800;
  for (let i = 0; i < eventRows.length; i += CHUNK) {
    await writeBatch(db, eventRows.slice(i, i + CHUNK), []);
  }
  for (let i = 0; i < pointRows.length; i += CHUNK) {
    await writeBatch(db, [], pointRows.slice(i, i + CHUNK));
  }

  // chat_health is written by the chat route, not by ingest, so it is seeded
  // directly. Without it the backend panel is empty and reads as an outage.
  for (let day = 0; day < DAYS; day += 1) {
    const at = dayStartMs(ANCHOR) - (DAYS - 1 - day) * 86_400_000;
    const requests = Math.max(0, Math.round(perDay[day] * between(0.1, 0.3)));
    if (requests === 0) continue;
    const fail = chance(0.12) ? intBetween(1, 3) : 0;
    await db
      .prepare(
        `INSERT INTO chat_health
           (day, requests, backend_configured, backend_ok, backend_fail, guard_short_circuit)
         VALUES (?1, ?2, 1, ?3, ?4, ?5)
         ON CONFLICT(day) DO NOTHING`,
      )
      .bind(
        istDayKey(at + 3_600_000),
        requests,
        Math.max(0, requests - fail),
        fail,
        chance(0.2) ? 1 : 0,
      )
      .run();
  }

  return sessions;
}

/* ─────────────────────── payload assembly ─────────────────────── */

function optionsFor(days: number): QueryOptions {
  const until = dayStartMs(ANCHOR) + 86_400_000 - 1;
  return {
    window: {
      since: dayStartMs(ANCHOR) - (days - 1) * 86_400_000,
      until,
      days,
      label: `${days} days`,
    } as QueryOptions['window'],
    excludeInternal: true,
    cidrsActive: 2,
    visitorsActive: 1,
  };
}

/**
 * One range's payloads, typed as what the query functions actually return.
 *
 * Written out rather than left as `Record<string, unknown>`: the validator
 * below reads a couple of dozen fields, and with an untyped bag every read
 * needed a cast, which is how `r.sessions as unknown[]` ended up asserting a
 * record was an array. Casts silence the compiler exactly where the checking
 * was worth having.
 */
interface RangeBundle {
  overview: Overview;
  audience: Audience;
  campaigns: Campaigns;
  chat: ChatStats;
}

const DEVICE_BANDS = ['desktop', 'tablet', 'mobile'] as const;
const KINDS = ['click', 'dead', 'rage'] as const;
const MODES = ['resume', 'immersive'] as const;

async function main(): Promise<void> {
  const { db, close } = openDemoDatabase();
  try {
    for (const statement of SCHEMA_STATEMENTS) {
      await db.prepare(statement).run();
    }

    const sessions = await seed(db);
    process.stdout.write(`seeded ${sessions} sessions over ${DAYS} days\n`);

    const byRange: Record<string, RangeBundle> = {};
    const perRangeSessions: Record<string, SessionRow[]> = {};
    for (const days of RANGES) {
      const o = optionsFor(days);
      byRange[String(days)] = {
        overview: await overview(db, o),
        audience: await audience(db, o),
        campaigns: await campaigns(db, o),
        chat: await chatStats(db, o),
      };
      // Collected per range only so the identity below can be *checked*.
      perRangeSessions[String(days)] = await listSessions(db, {
        ...o,
        limit: SESSION_ROWS,
      });
    }

    /**
     * One session list, not three.
     *
     * `listSessions` orders by `last_seen DESC` and every range ends at the
     * same anchor, so the newest 30 rows are byte-identical across 7, 30 and
     * 90 days, 40 KB of the payload was the same table three times.
     *
     * Asserted rather than assumed: if a future ANCHOR or RANGES change makes
     * the lists diverge, this fails the build instead of quietly showing the
     * 90-day list under a 7-day heading.
     */
    const sessionRows = perRangeSessions[String(RANGES[0])];
    const canonical = JSON.stringify(sessionRows);
    for (const days of RANGES) {
      if (JSON.stringify(perRangeSessions[String(days)]) !== canonical) {
        throw new Error(
          `session lists differ between ranges (${days}d vs ${RANGES[0]}d). ` +
            `They are deduplicated in the payload, so they must match, ` +
            `store them per range again if this is now intended.`,
        );
      }
    }

    // Every heatmap combination the controls can select, per range.
    // Precomputed because the page is static. There is no endpoint behind it
    // to ask. Keyed by range too, so changing the date range moves the
    // heatmap along with every other panel rather than leaving one stale
    // number on screen contradicting the rest.
    const heat: Record<string, ClickMap> = {};
    for (const days of RANGES) {
      const o = optionsFor(days);
      for (const device of DEVICE_BANDS) {
        for (const kind of KINDS) {
          for (const mode of MODES) {
            heat[`${days}:${device}:${kind}:${mode}`] = await clickMap(db, {
              ...o,
              kind,
              device,
              mode,
            } as Parameters<typeof clickMap>[1]);
          }
        }
      }
    }

    validate(byRange, heat, sessionRows);

    // `meta()` in queries.ts stamps `generatedAt: Date.now()`, which is right
    // for a live dashboard and wrong for a committed snapshot: it made every
    // run rewrite 132 lines of the JSON and broke the determinism this file
    // claims in its header. Pinned to the anchor instead, the honest value
    // for a sample, and the page states the date anyway.
    pinGeneratedAt(byRange, dayStartMs(ANCHOR));
    pinGeneratedAt(heat, dayStartMs(ANCHOR));

    const payload = {
      $comment:
        'GENERATED by scripts/seed-analytics-demo.ts. Do not hand-edit. ' +
        'Synthetic sample data for the public showcase at /analytics. ' +
        'No real visitor is represented here.',
      anchor: ANCHOR,
      seed: SEED,
      days: DAYS,
      totalSessions: sessions,
      sessionRows,
      retentionDays: RETENTION_DAYS,
      ranges: byRange,
      heat,
    };

    writeFileSync(OUT, `${JSON.stringify(payload, null, 1)}\n`);
    const bytes = JSON.stringify(payload).length;
    process.stdout.write(
      `wrote ${OUT.replace(`${process.cwd()}/`, '')}, ${(bytes / 1024).toFixed(0)} KB\n`,
    );
  } finally {
    close();
  }
}

/**
 * Rewrite every `meta.generatedAt` in the payload to a fixed instant.
 *
 * Walks rather than reaching for known paths: `generatedAt` appears in six
 * places today (one per query per range, plus every heatmap combination), and
 * a hand-written list of them would silently miss the seventh.
 */
function pinGeneratedAt(node: unknown, at: number): void {
  if (Array.isArray(node)) {
    for (const item of node) pinGeneratedAt(item, at);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (key === 'generatedAt' && typeof value === 'number') record[key] = at;
    else pinGeneratedAt(value, at);
  }
}

/**
 * Refuse to write a showcase with an empty panel.
 *
 * Every check here corresponds to something visible. A silently empty panel is
 * the worst outcome for this feature: it reads to a visitor as a broken
 * dashboard, which is the opposite of the intended impression, and it would
 * ship without anyone noticing because nothing threw.
 */
function validate(
  byRange: Record<string, RangeBundle>,
  heat: Record<string, ClickMap>,
  sessionRows: SessionRow[],
): void {
  const problems: string[] = [];
  const need = (ok: boolean, what: string) => {
    if (!ok) problems.push(what);
  };

  for (const days of RANGES) {
    const bundle = byRange[String(days)];
    const label = `${days}d`;
    const { overview: ov, audience: au, campaigns: cp, chat: ch } = bundle;
    const fn = ov.funnel;

    need(fn.sessions > 0, `${label} funnel.sessions`);
    need(fn.engaged > 0, `${label} funnel.engaged`);
    need(fn.sawImmersive > 0, `${label} funnel.sawImmersive`);
    need(fn.chatOpened > 0, `${label} funnel.chatOpened`);
    need(fn.chatAsked > 0, `${label} funnel.chatAsked`);
    need(fn.reachedOut > 0, `${label} funnel.reachedOut`);
    // The funnel must also be internally coherent. A step that exceeds the one
    // above it is not a small blemish. It is a dashboard that cannot be
    // trusted, and it is exactly what a generator produces when two paths
    // emit the same conversion independently.
    need(fn.engaged <= fn.sessions, `${label} funnel: engaged > sessions`);
    need(fn.chatAsked <= fn.chatOpened, `${label} funnel: asked > opened`);
    need(fn.reachedOut <= fn.sessions, `${label} funnel: reachedOut > sessions`);

    need(ov.sections.length > 0, `${label} sections`);
    need(ov.clicks.length > 0, `${label} clicks`);
    need(ov.ctas.length > 0, `${label} ctas`);
    need(ov.friction.length > 0, `${label} friction`);
    need(ov.exitClicks.length > 0, `${label} exitClicks`);
    need(ov.devices.length > 1, `${label} devices`);
    need(ov.browsers.length > 1, `${label} browsers`);
    need(ov.sources.length > 1, `${label} sources`);
    need(ov.daily.length > 0, `${label} daily`);
    need(ov.modes.length > 0, `${label} modes`);
    need(ov.engagement.medianSeconds > 0, `${label} engagement.medianSeconds`);
    need(ov.engagement.medianScrollPx > 0, `${label} engagement.medianScrollPx`);
    // Sections are in document order, so reach must be non-increasing. A
    // section reached by more sessions than the one above it would mean the
    // funnel chart reads backwards.
    const reach = ov.sections.map((r) => r.sessions);
    need(
      reach.every((n, i) => i === 0 || n <= reach[i - 1]),
      `${label} sections: reach is not monotonic (${reach.join(' > ')})`,
    );
    // Every CTA impression count must cover its own clicks, or the CTR column
    // shows a rate above 100% with no explanation.
    /**
     * Only rows that HAVE impressions are checked.
     *
     * The first version of this check asserted `clicked <= seen` for every
     * row and failed on nine tags, all with `seenSessions === 0`. That is
     * not incoherent data: the markup carries `data-track-tag` on 26 elements
     * and `data-track-cta` on only 10, so a tag with no CTA attribute
     * legitimately has clicks and no impressions. `ratio()` returns null
     * rather than 0 for a zero base, so the table shows a dash, not a rate
     * above 100%, which was the failure I had assumed.
     *
     * The narrower check is still worth having: for a tag that IS
     * impression-tracked, clicks exceeding impressions would be a real
     * contradiction, and it is what the click gating above prevents.
     */
    const overClicked = ov.ctas.filter(
      (c) => c.seenSessions > 0 && c.clickedSessions > c.seenSessions,
    );
    need(
      overClicked.length === 0,
      `${label} ctas: clicked > seen for ${overClicked
        .map((c) => `${c.tag} (${c.clickedSessions}/${c.seenSessions})`)
        .join(', ')}`,
    );

    need(au.cities.length > 1, `${label} audience.cities`);
    need(au.os.length > 1, `${label} audience.os`);
    need(au.sourceMedium.length > 1, `${label} audience.sourceMedium`);
    need(au.geoAvailable, `${label} audience.geoAvailable`);
    // Requires history *before* the window opens, which only holds while the
    // range is narrower than the generated span. See the note on DAYS.
    need(
      days < DAYS && au.visitors.returning > 0,
      `${label} audience.visitors.returning`,
    );

    need(cp.campaigns.length > 0, `${label} campaigns`);
    need(cp.totals.tagged > 0, `${label} campaigns.totals.tagged`);
    need(cp.totals.untagged > 0, `${label} campaigns.totals.untagged`);

    need(ch.asked > 0, `${label} chat.asked`);
    need(ch.topQuestions.length > 0, `${label} chat.topQuestions`);
    need(ch.unmatchedQuestions.length > 0, `${label} chat.unmatchedQuestions`);
    need(ch.backend.length > 0, `${label} chat.backend`);
    need(ch.sources.length > 0, `${label} chat.sources`);
    // These three are exact-string matches against `props.source`, so a typo
    // in GAP_SOURCE or GUARD_SOURCES shows up as a silent zero rather than an
    // error. That is precisely what happened with "Not documented yet".
    need(ch.coverageGapPct > 0, `${label} chat.coverageGapPct`);
    need(ch.guardHitPct > 0, `${label} chat.guardHitPct`);
    need(ch.medianLatencyMs > 0, `${label} chat.medianLatencyMs`);
    need(ch.abandoned > 0, `${label} chat.abandoned`);
    need(ch.questionTextRetentionDays > 0, `${label} chat.questionTextRetentionDays`);

  }

  need(sessionRows.length > 0, 'sessions list is empty');
  // Every row must carry geo, and none may look like a real person's
  // employer. Every asnOrg in the sample is a consumer ISP or cloud host by
  // construction; this asserts the construction held.
  need(
    sessionRows.every((row) => row.city !== null && row.country !== null),
    'sessions: a row is missing geo',
  );

  // The combinations a visitor sees before touching anything must have points,
  // and must have enough concentration for the colour ramp to mean something.
  // The rarer combinations are allowed to be empty, a mobile rage-click map
  // legitimately can be, and ClickHeatmap has a real empty state for that.
  for (const days of RANGES) {
    for (const combo of [
      'desktop:click:resume',
      'mobile:click:resume',
      'desktop:dead:resume',
    ]) {
      const key = `${days}:${combo}`;
      const map = heat[key];
      need(Boolean(map) && map.cells.length > 0, `heat ${key} cells`);
      if (!map) continue;
      need(map.medianDocH > 0, `heat ${key} medianDocH`);
      // maxN of 1-2 renders as a uniformly cold map, which reads as a bug
      // rather than as data. The floor scales with the window because a
      // 7-day slice is legitimately sparser, the colour ramp has 5 stops, so
      // 4 is enough to show variation there, while the widest window should
      // show real concentration. See tagPosition().
      if (combo === 'desktop:click:resume') {
        const floor = days >= 90 ? 20 : 4;
        need(
          map.maxN >= floor,
          `heat ${key} maxN >= ${floor} (got ${map.maxN})`,
        );
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `seed produced empty or incoherent panels, the showcase would look ` +
        `broken:\n  - ${problems.join('\n  - ')}`,
    );
  }
  process.stdout.write(
    `validated: ${RANGES.length} ranges, every panel populated and coherent\n`,
  );
}

await main();
