'use client';
/**
 * The public showcase at `/analytics`.
 *
 * ── What this is, and what it deliberately is not ──────────────────────────
 * It renders the **same panel components** `/admin` renders, AnalyticsPanel,
 * ClicksPanel, ClickHeatmap, AudiencePanel, ChatPanel, CampaignsPanel,
 * SessionsPanel, against a committed sample dataset. Reusing them is the
 * whole design: a second set of "demo" panels would drift from the real ones,
 * and a showcase of a dashboard that no longer looks like the dashboard is
 * worse than no showcase.
 *
 * It is NOT the live panel with the auth removed. Real visitor data cannot go
 * here: `/admin` shows verbatim chatbot questions and a per-session table
 * carrying city, ASN organisation and a network prefix, at portfolio traffic
 * that combination identifies individuals, and the ASN is frequently an
 * employer. Publishing it would also contradict `/privacy`, which visitors
 * read on the understanding that the operator is the only audience.
 *
 * ── Why the panels are imported from components/admin/ ─────────────────────
 * Those files are pure presentation: each takes a payload prop and renders it.
 * None of them fetches, and none reads a credential, `lib/admin-client.ts` is
 * imported only by AdminShell, which this file does not use. So the boundary
 * that matters is "does it fetch", not "which folder is it in", and importing
 * the real panels here costs nothing while keeping them singular.
 *
 * The one thing that must never happen is this file gaining a `fetchAdmin`
 * call. It has no session and no token, so such a call would 404 forever, 
 * and, worse, it would mean a public page probing the gated API on every load.
 *
 * ── Why the data is committed JSON ─────────────────────────────────────────
 * The page is statically rendered. There is no endpoint behind it, which is
 * also why every control's options are precomputed in the JSON rather than
 * derived on demand: the range presets and all 18 heatmap combinations exist
 * as baked payloads. See scripts/seed-analytics-demo.ts.
 *
 * ── Why the data and every panel are their own chunks ──────────────────────
 * This file used to import all seven panels and the 272KB JSON statically,
 * which put the lot in one client chunk: about 352KB gzip of script before
 * the page could hydrate. The JSON is now a dynamic `import()`, read with
 * `use()`, and each panel a `lazy()` chunk, as DashboardDetail does with its
 * boards. Neither costs the static HTML anything: the server awaits both, so
 * the prerendered page is complete, and hydration keeps that markup on screen
 * while the chunks arrive in parallel instead of in one long download. It is
 * still a file in the bundle, not a request to anything with data behind it.
 *
 * A chunk that never arrives (offline, or a hashed name a redeploy removed)
 * rejects, which `<Suspense>` does not catch, so each sits under a
 * SceneBoundary: one failed panel says so in its own slot, and a failed
 * dataset leaves the navigation and a reload link rather than a blank page.
 */
import { lazy, Suspense, use, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { SHOWCASE_SECTIONS, SHOWCASE_SECTION_IDS, adminSection } from '@/components/admin/admin-sections';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminSection } from '@/components/admin/AdminSection';
import type { Device } from '@/components/admin/ClickHeatmap';
import SceneBoundary from '@/components/portfolio/SceneBoundary';
import { queueEvent } from '@/lib/analytics/queue';
import { ThemeToggle } from '@/components/admin/ThemeToggle';
import { useAdminSectionNav } from '@/hooks/use-admin-section-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';
import type {
  Audience,
  Campaigns,
  ChatStats,
  ClickMap,
  Overview,
  SessionRow,
} from '@/lib/analytics/types';

const AnalyticsPanel = lazy(() => import('@/components/admin/AnalyticsPanel').then((m) => ({ default: m.AnalyticsPanel })));
const ClicksPanel = lazy(() => import('@/components/admin/ClicksPanel').then((m) => ({ default: m.ClicksPanel })));
const ClickHeatmap = lazy(() => import('@/components/admin/ClickHeatmap').then((m) => ({ default: m.ClickHeatmap })));
const AudiencePanel = lazy(() => import('@/components/admin/AudiencePanel').then((m) => ({ default: m.AudiencePanel })));
const ChatPanel = lazy(() => import('@/components/admin/ChatPanel').then((m) => ({ default: m.ChatPanel })));
const CampaignsPanel = lazy(() => import('@/components/admin/CampaignsPanel').then((m) => ({ default: m.CampaignsPanel })));
const SessionsPanel = lazy(() => import('@/components/admin/SessionsPanel').then((m) => ({ default: m.SessionsPanel })));

/**
 * Requested when this module is evaluated, not when it first renders, so the
 * dataset downloads alongside the panel chunks rather than after them. One
 * promise for the life of the page, which is what `use()` needs.
 */
const DEMO = import('@/content/analytics-demo.json').then((m) => m.default);
type Demo = Awaited<typeof DEMO>;

/** One range's worth of precomputed payloads. */
interface RangeBundle {
  overview: Overview;
  audience: Audience;
  campaigns: Campaigns;
  chat: ChatStats;
}

/**
 * The JSON is typed as `unknown`-ish by `resolveJsonModule`, which infers
 * literal types for every number and cannot know these are the query payloads.
 * Asserted once, here, rather than at seven use sites.
 *
 * The assertion is safe in the way that matters: the file is generated by
 * running the real query functions, whose return types *are* these interfaces.
 * If a payload shape changes, the generator changes with it.
 */
function payloads(demo: Demo) {
  return {
    ranges: demo.ranges as unknown as Record<string, RangeBundle>,
    heat: demo.heat as unknown as Record<string, ClickMap>,
    sessionRows: demo.sessionRows as unknown as SessionRow[],
  };
}
/**
 * One list, shared by every range.
 *
 * `listSessions` orders by last seen and all three windows end on the same
 * anchor date, so the newest rows are identical across them, stored once
 * rather than three times, which took 40 KB out of this page's bundle. The
 * generator asserts they really do match before deduplicating. (`sessionRows`
 * in payloads() above.)
 */

const RANGE_OPTIONS = [
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
] as const;

/** `2026-09-09` as `9 September 2026`, without pulling in a date library. */
function prettyAnchor(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December',
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

/** Each panel's own boundary, so one chunk failing costs one slot. */
function Slot({ children }: { children: ReactNode }) {
  return (
    <SceneBoundary
      scope="showcase-chunk"
      onError={(scope) => queueEvent('error', { props: { scope } })}
      fallback={<p className="rounded-lg border p-4 text-xs text-muted-foreground">This panel did not load. <button type="button" className="underline underline-offset-2" onClick={() => location.reload()}>Reload the page</button> to try again.</p>}
    >
      <Suspense fallback={<div className="min-h-40 rounded-lg border p-4 text-xs text-muted-foreground">Loading…</div>}>{children}</Suspense>
    </SceneBoundary>
  );
}

export function ShowcaseShell() {
  const active = useAdminSectionNav(SHOWCASE_SECTION_IDS);
  // The navigation needs no data, so it sits outside the boundary and stays
  // usable whatever happens to the dataset's chunk.
  return (
    <SidebarProvider>
      <AdminNav active={active} sections={SHOWCASE_SECTIONS} />
      <SidebarInset>
        <SceneBoundary
          scope="showcase-chunk"
          onError={(scope) => queueEvent('error', { props: { scope } })}
          fallback={<p className="px-4 py-10 text-sm text-muted-foreground">The sample data did not load. <button type="button" className="underline underline-offset-2" onClick={() => location.reload()}>Reload the page</button> to try again.</p>}
        >
          <Suspense fallback={<p className="px-4 py-10 text-sm text-muted-foreground">Loading the sample data…</p>}>
            <Showcase />
          </Suspense>
        </SceneBoundary>
      </SidebarInset>
    </SidebarProvider>
  );
}

function Showcase() {
  const demo = use(DEMO);
  const { ranges: RANGES, heat: HEAT, sessionRows: SESSION_ROWS } = useMemo(() => payloads(demo), [demo]);
  const [rangeId, setRangeId] = useState<string>('30');
  const [device, setDevice] = useState<Device>('desktop');
  const [kind, setKind] = useState<'click' | 'dead' | 'rage'>('click');
  const [mode, setMode] = useState<'resume' | 'immersive'>('resume');

  const bundle = RANGES[rangeId] ?? RANGES['30'];
  // Keyed by range as well as by the three controls, so changing the date
  // range moves the heatmap with every other panel instead of leaving one
  // stale figure on screen contradicting the rest.
  const heat = useMemo(
    () => HEAT[`${rangeId}:${device}:${kind}:${mode}`] ?? null,
    [HEAT, rangeId, device, kind, mode],
  );

  const anchor = prettyAnchor(demo.anchor);

  return (
    <>
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur">
          <SidebarTrigger />
          <div className="min-w-0 flex-1">
            <p className="font-heading text-sm leading-tight">
              Portfolio analytics
              <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
                Sample data
              </Badge>
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {bundle.overview.meta.window.days} days to {anchor} · IST
            </p>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex flex-col gap-8 px-4 py-5">
          <SampleNotice anchor={anchor} totalSessions={demo.totalSessions} days={demo.days} />

          {/* The range control. Deliberately not labelled "Last 7 days": these
              are windows into a fixed sample, and a relative label would be a
              lie the day after the file was generated. */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">Window</span>
            <ToggleGroup
              value={[rangeId]}
              onValueChange={(v) => {
                const next = v[0];
                if (next) setRangeId(next);
              }}
              className="flex-wrap"
            >
              {RANGE_OPTIONS.map((option) => (
                <ToggleGroupItem
                  key={option.id}
                  value={option.id}
                  className="text-xs"
                >
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <span className="text-[11px] text-muted-foreground">
              ending {anchor}
            </span>
          </div>

          <AdminSection
            id="admin-overview"
            title={adminSection('admin-overview').label}
            blurb={adminSection('admin-overview').blurb}
          >
            <Slot><AnalyticsPanel data={bundle.overview} /></Slot>
          </AdminSection>

          <AdminSection
            id="admin-clicks"
            title={adminSection('admin-clicks').label}
            blurb={adminSection('admin-clicks').blurb}
          >
            <Slot><ClicksPanel data={bundle.overview} /></Slot>
          </AdminSection>

          <AdminSection
            id="admin-heatmap"
            title={adminSection('admin-heatmap').label}
            blurb={adminSection('admin-heatmap').blurb}
          >
            {/* `loading` is false and `error` null forever: `use(DEMO)` has
                the data before this renders, so there is nothing to wait for
                and nothing to fail.
                onRefresh is a no-op for the same reason, a Refresh button
                that re-renders identical data would imply the numbers move. */}
            <Slot><ClickHeatmap
              data={heat}
              device={device}
              kind={kind}
              mode={mode}
              loading={false}
              error={null}
              onDevice={setDevice}
              onKind={setKind}
              onMode={setMode}
              onRefresh={() => {}}
            /></Slot>
          </AdminSection>

          <AdminSection
            id="admin-audience"
            title={adminSection('admin-audience').label}
            blurb={adminSection('admin-audience').blurb}
          >
            <Slot><AudiencePanel data={bundle.audience} /></Slot>
          </AdminSection>

          <AdminSection
            id="admin-chat"
            title={adminSection('admin-chat').label}
            blurb={adminSection('admin-chat').blurb}
          >
            <Slot><ChatPanel data={bundle.chat} /></Slot>
          </AdminSection>

          <AdminSection
            id="admin-campaigns"
            title={adminSection('admin-campaigns').label}
            blurb={adminSection('admin-campaigns').blurb}
          >
            <Slot><CampaignsPanel data={bundle.campaigns} /></Slot>
          </AdminSection>

          <AdminSection
            id="admin-sessions"
            title={adminSection('admin-sessions').label}
            blurb={adminSection('admin-sessions').blurb}
          >
            <Slot><SessionsPanel rows={SESSION_ROWS} /></Slot>
          </AdminSection>

          <HowItWorks />
        </main>
    </>
  );
}

/**
 * The disclosure, above the numbers rather than below them.
 *
 * Placed first because a visitor who reads one thing on this page must read
 * this one: every figure below is fabricated, and a dashboard is exactly the
 * kind of artefact people assume is real. Saying so underneath would be a
 * footnote to a claim already made.
 */
function SampleNotice({ anchor, totalSessions, days }: { anchor: string; totalSessions: number; days: number }) {
  return (
    <div className="rounded-lg border border-[var(--color-chart-4)]/40 bg-[var(--color-chart-4)]/5 p-4">
      <p className="text-sm font-medium">
        Every number on this page is synthetic.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        This is a working copy of my private analytics dashboard, running on{' '}
        {totalSessions.toLocaleString('en-IN')} generated sessions over{' '}
        {days} days ending {anchor}. No real visitor is represented, and
        nothing here was measured from anyone who read this site, including
        you. The panels, queries and charts are the production ones; only the
        rows underneath are invented.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        The real dashboard is private, and stays private on purpose. It shows
        the text people type into the chat panel and a per-visit table with
        city and network operator, at this much traffic that is enough to
        identify someone, so it is not mine to publish. See{' '}
        <Link className="underline underline-offset-2" href="/privacy">
          the privacy page
        </Link>{' '}
        for what is actually collected, and how to switch it off.
      </p>
    </div>
  );
}

/** The engineering notes. The part an engineer reading this actually wants. */
function HowItWorks() {
  const notes: [string, string][] = [
    [
      'First-party, no third-party scripts',
      'No Google Analytics, no Tag Manager, no Clarity, no pixel of any ' +
        'kind. One 12 KB collector posting batched events to a Cloudflare ' +
        'Worker, and a D1 (SQLite) database behind it.',
    ],
    [
      'No IP address is ever stored',
      'Only salted SHA-256 hashes (one counts distinct visitors, one keys the ' +
        'rate limit) plus a coarse /24 or /48 network prefix. The salt is ' +
        'required: an unsalted ' +
        'hash of the IPv4 space is reversible in minutes, so ingest refuses ' +
        'to write at all when it is unset.',
    ],
    [
      'Dwell is measured on leaving, not entering',
      'A section emits its page_view when the reader leaves it, carrying the ' +
        'time spent. Emitting on entry would mean every scroll past counted ' +
        'as a read, and the funnel would measure scrolling rather than ' +
        'attention.',
    ],
    [
      'Rates return null, not zero',
      'A click-through rate with nobody in the denominator is not 0%. It is ' +
        'undefined, and renders as a dash. Shown as 0% it invites the reader ' +
        'to conclude a step is broken when there was simply nothing to convert.',
    ],
    [
      'Days are pinned to IST',
      'Every daily bucket is UTC+5:30, never the database server’s idea of ' +
        'local time. Without that, "today" changes meaning depending on where ' +
        'the query ran.',
    ],
    [
      'Question text expires before the counts do',
      'The words people typed are deleted after 30 days; the counts, rates ' +
        'and coverage gaps survive to 180. Click coordinates go at 30 days too.',
    ],
  ];

  return (
    <section className="scroll-mt-2">
      <h2 className="font-heading text-lg leading-tight">How it works</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        The decisions that took the longest, and why they went the way they did.
      </p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {notes.map(([title, body]) => (
          <div key={title} className="rounded-lg border bg-card p-3">
            <dt className="text-xs font-medium">{title}</dt>
            <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {body}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          nativeButton={false}
          variant="outline"
          size="sm"
          className="text-xs"
          render={
            // The repo is private, so a GitHub link was a 404 for every
            // visitor. The page renders ANALYTICS.md itself.
            <Link href="/analytics/design-notes" data-track-tag="showcase-design-notes">
              Read the design notes
            </Link>
          }
        />
        <Button
          nativeButton={false}
          variant="ghost"
          size="sm"
          className="text-xs"
          render={
            <Link href="/privacy" data-track-tag="showcase-privacy">
              What gets collected
            </Link>
          }
        />
        <Button
          nativeButton={false}
          variant="ghost"
          size="sm"
          className="text-xs"
          render={
            <Link href="/" data-track-tag="showcase-home">
              Back to the portfolio
            </Link>
          }
        />
      </div>
      <footer className="pt-6 pb-8 text-[11px] text-muted-foreground">
        Sample data generated by <code>scripts/seed-analytics-demo.ts</code>,
        which pushes synthetic events through the same validation, ingest and
        SQL the live site uses, so these panels show real query output over
        invented rows, not hand-written figures.
      </footer>
    </section>
  );
}
