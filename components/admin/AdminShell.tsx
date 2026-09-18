'use client';
/**
 * The panel shell: owns the range, the internal filter, and one fetch per
 * panel.
 *
 * ── Why the data is fetched client-side ────────────────────────────────────
 * The range presets and the traffic filter are controls an operator changes
 * constantly. A server-fetched payload would mean a full round trip per
 * click, and (more importantly) one failing query would blank the whole
 * page. Each panel fetches independently and renders its own error, so a
 * broken campaigns query cannot take the funnel above it with it.
 *
 * ── Never a zeroed panel ───────────────────────────────────────────────────
 * `fetchAdmin` throws rather than returning an empty payload, and every panel
 * here distinguishes "loading", "failed" and "no data". An empty funnel and a
 * broken endpoint look identical otherwise, and only one of them means nobody
 * visited.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchAdmin, AdminError } from '@/lib/admin-client';
import {
  describeRange,
  resolveRange,
  type RangeId,
  type Window,
} from '@/lib/analytics/time';
import type {
  Audience,
  Campaigns,
  ChatStats,
  ClickMap,
  Overview,
  SessionRow,
} from '@/lib/analytics/types';
import { ADMIN_SECTIONS, adminSection } from './admin-sections';
import { AdminNav } from './AdminNav';
import { AdminSection, PanelError } from './AdminSection';
import { AnalyticsPanel } from './AnalyticsPanel';
import { AudiencePanel } from './AudiencePanel';
import { CampaignsPanel } from './CampaignsPanel';
import { ChatPanel } from './ChatPanel';
import { ClicksPanel } from './ClicksPanel';
import { ClickHeatmap, type Device } from './ClickHeatmap';
import { InternalNotice } from './InternalNotice';
import { RangeControls } from './RangeControls';
import { SessionsPanel } from './SessionsPanel';
import { SignOutButton } from './SignOutButton';
import { ThemeToggle } from './ThemeToggle';
import { useAdminSectionNav } from '@/hooks/use-admin-section-nav';
import { useStoredFlag } from '@/hooks/use-stored';

const INTERNAL_KEY = 'admin:analytics:excludeInternal';

interface Slot<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

const idle = <T,>(): Slot<T> => ({ data: null, error: null, loading: true });

export function AdminShell({ who }: { who: string }) {
  const [rangeId, setRangeId] = useState<RangeId>('30d');
  const [custom, setCustom] = useState({ from: '', to: '' });
  // Defaults to excluding internal traffic, the same default as the server,
  // so the panel and the API cannot disagree on a first visit. Read as a
  // subscription rather than in an effect; see hooks/use-stored.ts.
  const [excludeInternal, persistInternal] = useStoredFlag(INTERNAL_KEY, true);
  const [nonce, setNonce] = useState(0);
  // Pinned, not sampled per render: a window that drifts while you read it
  // makes two numbers on the same screen describe different periods.
  // Advanced only by Refresh, which is an event handler.
  const [now, setNow] = useState(() => Date.now());

  const [device, setDevice] = useState<Device>('desktop');
  const [kind, setKind] = useState<'click' | 'dead' | 'rage'>('click');
  const [mode, setMode] = useState<'resume' | 'immersive'>('resume');

  const [overview, setOverview] = useState<Slot<Overview>>(idle);
  const [audience, setAudience] = useState<Slot<Audience>>(idle);
  const [campaigns, setCampaigns] = useState<Slot<Campaigns>>(idle);
  const [chat, setChat] = useState<Slot<ChatStats>>(idle);
  const [heat, setHeat] = useState<Slot<ClickMap>>(idle);
  const [sessions, setSessions] = useState<Slot<SessionRow[]>>(idle);

  const window_: Window = useMemo(
    () => resolveRange(rangeId, now, custom),
    // A new object each render would refetch forever; these are the only real
    // dependencies.
    [rangeId, now, custom],
  );

  /** The same resolved bounds and flag go to every panel. Never a per-panel toggle. */
  const params = useMemo(
    () => ({
      from: window_.since,
      to: window_.until,
      excludeInternal,
    }),
    [window_.since, window_.until, excludeInternal],
  );

  const load = useCallback(
    async function load<T>(
      action: Parameters<typeof fetchAdmin>[0],
      set: (s: Slot<T>) => void,
      extra: Record<string, string | number | boolean | null> = {},
    ) {
      set({ data: null, error: null, loading: true });
      try {
        const data = await fetchAdmin<T>(action, { ...params, ...extra });
        set({ data, error: null, loading: false });
      } catch (error) {
        set({
          data: null,
          error:
            error instanceof AdminError
              ? error.message
              : 'Something went wrong loading this panel.',
          loading: false,
        });
      }
    },
    [params],
  );

  useEffect(() => {
    void load<Overview>('analytics', setOverview);
    void load<Audience>('audience', setAudience);
    void load<Campaigns>('campaigns', setCampaigns);
    void load<ChatStats>('chat', setChat);
    void load<SessionRow[]>('sessions', setSessions, { limit: 60 });
  }, [load, nonce]);

  useEffect(() => {
    void load<ClickMap>('click-map', setHeat, { kind, device, mode });
  }, [load, nonce, kind, device, mode]);

  const active = useAdminSectionNav(ADMIN_SECTIONS.map((s) => s.id));
  const anyLoading =
    overview.loading || audience.loading || campaigns.loading || chat.loading;

  return (
    <SidebarProvider>
      <AdminNav active={active} />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur">
          <SidebarTrigger />
          <div className="min-w-0 flex-1">
            <p className="font-heading text-sm leading-tight">
              Portfolio analytics
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {describeRange(window_)} · signed in as {who}
            </p>
          </div>
          <ThemeToggle />
          <SignOutButton />
        </header>

        <main className="flex flex-col gap-8 px-4 py-5">
          <RangeControls
            rangeId={rangeId}
            custom={custom}
            excludeInternal={excludeInternal}
            loading={anyLoading}
            onRangeId={setRangeId}
            onCustom={setCustom}
            onExcludeInternal={persistInternal}
            onRefresh={() => {
              setNow(Date.now());
              setNonce((n) => n + 1);
            }}
          />

          <InternalNotice summary={overview.data?.internal} />

          <AdminSection
            id="admin-overview"
            title={adminSection('admin-overview').label}
            blurb={adminSection('admin-overview').blurb}
          >
            {overview.error ? (
              <PanelError message={overview.error} />
            ) : overview.data ? (
              <AnalyticsPanel data={overview.data} />
            ) : (
              <PanelSkeleton />
            )}
          </AdminSection>

          <AdminSection
            id="admin-clicks"
            title={adminSection('admin-clicks').label}
            blurb={adminSection('admin-clicks').blurb}
          >
            {overview.error ? (
              <PanelError message={overview.error} />
            ) : overview.data ? (
              <ClicksPanel data={overview.data} />
            ) : (
              <PanelSkeleton />
            )}
          </AdminSection>

          <AdminSection
            id="admin-heatmap"
            title={adminSection('admin-heatmap').label}
            blurb={adminSection('admin-heatmap').blurb}
          >
            <ClickHeatmap
              data={heat.data}
              device={device}
              kind={kind}
              mode={mode}
              loading={heat.loading}
              error={heat.error}
              onDevice={setDevice}
              onKind={setKind}
              onMode={setMode}
              onRefresh={() => setNonce((n) => n + 1)}
            />
          </AdminSection>

          <AdminSection
            id="admin-audience"
            title={adminSection('admin-audience').label}
            blurb={adminSection('admin-audience').blurb}
          >
            {audience.error ? (
              <PanelError message={audience.error} />
            ) : audience.data ? (
              <AudiencePanel data={audience.data} />
            ) : (
              <PanelSkeleton />
            )}
          </AdminSection>

          <AdminSection
            id="admin-chat"
            title={adminSection('admin-chat').label}
            blurb={adminSection('admin-chat').blurb}
          >
            {chat.error ? (
              <PanelError message={chat.error} />
            ) : chat.data ? (
              <ChatPanel data={chat.data} />
            ) : (
              <PanelSkeleton />
            )}
          </AdminSection>

          <AdminSection
            id="admin-campaigns"
            title={adminSection('admin-campaigns').label}
            blurb={adminSection('admin-campaigns').blurb}
          >
            {campaigns.error ? (
              <PanelError message={campaigns.error} />
            ) : campaigns.data ? (
              <CampaignsPanel data={campaigns.data} />
            ) : (
              <PanelSkeleton />
            )}
          </AdminSection>

          <AdminSection
            id="admin-sessions"
            title={adminSection('admin-sessions').label}
            blurb={adminSection('admin-sessions').blurb}
          >
            {sessions.error ? (
              <PanelError message={sessions.error} />
            ) : sessions.data ? (
              <SessionsPanel rows={sessions.data} />
            ) : (
              <PanelSkeleton />
            )}
          </AdminSection>

          <footer className="pb-8 text-[11px] text-muted-foreground">
            First-party only. No Google Analytics, no Tag Manager, no Clarity,
            no third-party script of any kind. Visitor IP addresses are never
            stored, only a salted hash and a coarse network prefix.
          </footer>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}
