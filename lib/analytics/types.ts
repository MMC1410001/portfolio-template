/**
 * Result shapes, shared by the query layer and the dashboard.
 *
 * These replace Lumen's untyped `jsonb` return values. The payload shape
 * deliberately mirrors its `admin_analytics()` / `admin_audience()` /
 * `admin_campaigns()` / `admin_click_map()` output where a panel is a port, so
 * the UI reads the same fields: minus everything kundali, account, payment
 * and revenue shaped.
 */

import type { Window } from './time';

export interface InternalNotice {
  /** Whether the filter is on. */
  excluded: boolean;
  /** How many sessions in the window it actually matched. */
  sessionsMatched: number;
  /** How many CIDRs are configured and were accepted as safe. */
  cidrsActive: number;
  visitorsActive: number;
}

export interface RangeMeta {
  window: Window;
  /** Named so nobody has to assume the reader's zone. */
  timezone: 'IST';
  generatedAt: number;
  /**
   * The oldest data that can exist, in days.
   *
   * Reported so a 366-day request against a 180-day table does not read as a
   * traffic collapse, something the source system did not need to say
   * because its horizon matched its longest preset.
   */
  retentionDays: number;
}

export interface Funnel {
  sessions: number;
  engaged: number;
  sawImmersive: number;
  chatOpened: number;
  chatAsked: number;
  reachedOut: number;
}

export interface Engagement {
  sessions: number;
  avgSeconds: number;
  medianSeconds: number;
  /**
   * Share of sessions that saw at most one section.
   *
   * **Redefined from the source system.** On a one-page site every session has
   * exactly one page view, so Lumen's "one page view" bounce would be
   * 100%. This is the nearest honest equivalent, and the label says so.
   */
  shallowPct: number;
  sectionsPerSession: number;
  medianScrollPx: number;
}

export interface SectionRow {
  /** `'/#work'`, matching Lumen's `pages[].path` so the table is a port. */
  path: string;
  views: number;
  sessions: number;
  avgSeconds: number;
  exits: number;
  exitPct: number;
}

export interface ClickRow {
  label: string;
  tagged: boolean;
  section: string | null;
  clicks: number;
  sessions: number;
}

export interface ScrollRow {
  sessions: number;
  d25: number;
  d50: number;
  d75: number;
  d100: number;
}

export interface CtaRow {
  tag: string;
  seenSessions: number;
  clicks: number;
  clickedSessions: number;
  /** null, not 0, when nothing was ever seen, a rate with no denominator. */
  ctr: number | null;
}

export interface FrictionRow {
  kind: 'dead' | 'rage';
  section: string | null;
  selector: string | null;
  events: number;
  sessions: number;
}

export interface ExitClickRow {
  label: string;
  section: string | null;
  sessions: number;
  /** Of which then reached out, without this the dead end and the win rank alike. */
  converted: number;
}

export interface Breakdown {
  label: string;
  sessions: number;
  share: number;
}

export interface DailyRow {
  day: string;
  sessions: number;
  sectionViews: number;
  chatQuestions: number;
}

export interface ModeRow {
  mode: string;
  sessions: number;
  avgSeconds: number;
  avgSections: number;
}

export interface Overview {
  meta: RangeMeta;
  internal: InternalNotice;
  funnel: Funnel;
  engagement: Engagement;
  sections: SectionRow[];
  clicks: ClickRow[];
  scroll: ScrollRow;
  ctas: CtaRow[];
  friction: FrictionRow[];
  exitClicks: ExitClickRow[];
  devices: Breakdown[];
  browsers: Breakdown[];
  sources: Breakdown[];
  daily: DailyRow[];
  modes: ModeRow[];
}

export interface Audience {
  meta: RangeMeta;
  internal: InternalNotice;
  visitors: { new: number; returning: number; unknown: number };
  engagementRate: number;
  devices: Breakdown[];
  os: Breakdown[];
  cities: {
    city: string;
    region: string | null;
    country: string | null;
    sessions: number;
  }[];
  sourceMedium: {
    source: string;
    medium: string;
    tagged: string;
    sessions: number;
  }[];
  /**
   * Whether any row in the window carried a city.
   *
   * Reported from the data rather than assumed, so an empty panel reads as
   * "unavailable" instead of zero. Miniflare stubs `request.cf`, so geo will
   * look broken in local dev and work in production, the panel must say
   * which.
   */
  geoAvailable: boolean;
  geoSessions: number;
}

export interface CampaignRow {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  sessions: number;
  chatAsked: number;
  reachedOut: number;
}

export interface Campaigns {
  meta: RangeMeta;
  internal: InternalNotice;
  campaigns: CampaignRow[];
  totals: { tagged: number; untagged: number };
}

export interface ChatStats {
  meta: RangeMeta;
  internal: InternalNotice;
  asked: number;
  answered: number;
  opened: number;
  abandoned: number;
  /** The headline: every one of these is a row to add to content/faq.ts. */
  coverageGapPct: number;
  guardHitPct: number;
  offlinePct: number;
  medianLatencyMs: number;
  sources: Breakdown[];
  failures: Breakdown[];
  rejections: Breakdown[];
  topQuestions: { question: string; asks: number; matched: number }[];
  unmatchedQuestions: { question: string; asks: number }[];
  daily: { day: string; asked: number; unmatched: number }[];
  backend: {
    day: string;
    requests: number;
    backendOk: number;
    backendFail: number;
  }[];
  /** So the panel can say the words expire before the counts do. */
  questionTextRetentionDays: number;
}

export interface HeatCell {
  x: number;
  y: number;
  n: number;
}

export interface ClickMap {
  meta: RangeMeta;
  kind: string;
  device: string | null;
  mode: string | null;
  total: number;
  /** A real observed height, not an average of two nobody had. 0 = none. */
  medianDocH: number;
  cells: HeatCell[];
  maxN: number;
  /** Points whose device band could not be determined. */
  unclassified: number;
  /** Share of mapped clicks carrying the OTHER mode, the modeDrift warning. */
  otherModeShare: number;
}

export interface SessionRow {
  sessionId: string;
  firstSeen: number;
  lastSeen: number;
  events: number;
  device: string | null;
  browser: string | null;
  os: string | null;
  city: string | null;
  country: string | null;
  asnOrg: string | null;
  /** No address is stored, so this and asnOrg are what replace one. */
  ipPrefix: string | null;
  isInternal: boolean;
  verbs: string | null;
}
