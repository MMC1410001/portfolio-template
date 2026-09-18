'use client';
/**
 * The core panel: engagement, the section funnel, clicks, friction, and the
 * daily series.
 *
 * Dropped from the source system: the payment funnel, revenue, the two
 * conversion KPIs, the guest-to-Google block, and all the GTM/GA4/Clarity
 * prose. Kept: sections (its `pages`), ranked clicks, scroll reach, the CTA
 * funnel, friction, exit clicks, three breakdowns, the daily chart, and the
 * contract that a failed request never renders as zeros.
 */
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { sectionLabel } from '@/lib/analytics/section-catalogue';
import type { Overview } from '@/lib/analytics/types';
import { DataTable, NumCell, TableCell } from './DataTable';
import { Breakdown } from './Breakdown';
import { SectionFunnel } from './SectionFunnel';
import { StatTile } from './StatTile';
import { duration, num, pct, pixels, ratio } from './analytics-format';

/**
 * Chart colours come from the token config, not a JS palette.
 *
 * ChartStyle emits `--color-<key>` for both the light and `.dark` scopes, so
 * the series theme themselves off the same tokens as everything else. This is
 * why the source system's 146-line theme context disappeared.
 */
const dailyConfig = {
  sessions: { label: 'Sessions', color: 'var(--chart-1)' },
  sectionViews: { label: 'Section views', color: 'var(--chart-3)' },
  chatQuestions: { label: 'Chat questions', color: 'var(--chart-4)' },
} satisfies ChartConfig;

export function AnalyticsPanel({ data }: { data: Overview }) {
  const { engagement: e, funnel: f, scroll: s } = data;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Sessions" value={num(f.sessions)} />
        <StatTile
          label="Median visit"
          value={duration(e.medianSeconds)}
          note={`Mean ${duration(e.avgSeconds)}`}
        />
        <StatTile
          label="Median depth"
          value={pixels(e.medianScrollPx)}
          note="Deepest point reached, per session"
        />
        <StatTile
          label="Reached out"
          value={pct(ratio(f.reachedOut, f.sessions))}
          note="Emailed, opened the résumé, or followed a profile link"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Saw one section only"
          value={`${e.shallowPct}%`}
          // Named plainly rather than "bounce": on a one-page site every
          // session has exactly one page view, so the familiar metric would be
          // 100% and mean nothing. Saying what it counts keeps it quotable.
          note="Not the classic bounce rate. This is one page"
          tone={e.shallowPct > 60 ? 'warn' : 'default'}
        />
        <StatTile
          label="Sections per visit"
          value={e.sectionsPerSession.toFixed(1)}
        />
        <StatTile
          label="Opened the chat"
          value={pct(ratio(f.chatOpened, f.sessions))}
          note={`${num(f.chatAsked)} asked something`}
        />
        <StatTile
          label="Tried Experience mode"
          value={pct(ratio(f.sawImmersive, f.sessions))}
        />
      </div>

      <SectionFunnel rows={data.sections} />

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">Daily activity</CardTitle>
          <p className="text-xs text-muted-foreground">
            A quiet day is an explicit zero, not a gap.
          </p>
        </CardHeader>
        <CardContent className="px-4">
          {/* aspect-auto overrides ChartContainer's built-in aspect-video. */}
          <ChartContainer
            config={dailyConfig}
            className="aspect-auto h-56 w-full"
          >
            <LineChart data={data.daily} margin={{ left: 4, right: 8 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.25} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={(v: string) => v.slice(5)}
                fontSize={11}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={28}
                fontSize={11}
                allowDecimals={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              {/* A legend is always present at two or more series, so identity
                  is never carried by colour alone. */}
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                dataKey="sessions"
                name="Sessions"
                stroke="var(--color-sessions)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey="sectionViews"
                name="Section views"
                stroke="var(--color-sectionViews)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey="chatQuestions"
                name="Chat questions"
                stroke="var(--color-chatQuestions)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">
            Sections, and where visits end
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Dwell belongs to the section it names, including the last one, the
            measurement is taken on leaving.
          </p>
        </CardHeader>
        <CardContent className="px-4">
          <DataTable
            rows={data.sections}
            rowKey={(r) => r.path}
            defaultSort={{ key: 'views', dir: 'desc' }}
            columns={[
              { key: 'path', label: 'Section', sortValue: (r) => r.path },
              {
                key: 'views',
                label: 'Views',
                align: 'right',
                sortValue: (r) => r.views,
                descFirst: true,
              },
              {
                key: 'sessions',
                label: 'Sessions',
                align: 'right',
                sortValue: (r) => r.sessions,
                descFirst: true,
              },
              {
                key: 'avg',
                label: 'Avg time',
                align: 'right',
                sortValue: (r) => r.avgSeconds,
                descFirst: true,
              },
              {
                key: 'exit',
                label: 'Ended here',
                align: 'right',
                sortValue: (r) => r.exitPct,
                descFirst: true,
              },
            ]}
            renderRow={(r) => (
              <>
                <TableCell>{sectionLabel(r.path)}</TableCell>
                <NumCell>{num(r.views)}</NumCell>
                <NumCell>{num(r.sessions)}</NumCell>
                <NumCell>{duration(r.avgSeconds)}</NumCell>
                <NumCell>
                  {r.exitPct}%
                  <span className="ml-1 text-muted-foreground">
                    ({num(r.exits)})
                  </span>
                </NumCell>
              </>
            )}
            renderCard={(r) => (
              <>
                <p className="font-medium">{sectionLabel(r.path)}</p>
                <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono tabular-nums">
                  <dt className="text-muted-foreground">Views</dt>
                  <dd>{num(r.views)}</dd>
                  <dt className="text-muted-foreground">Sessions</dt>
                  <dd>{num(r.sessions)}</dd>
                  <dt className="text-muted-foreground">Avg time</dt>
                  <dd>{duration(r.avgSeconds)}</dd>
                  <dt className="text-muted-foreground">Ended here</dt>
                  <dd>
                    {r.exitPct}% ({num(r.exits)})
                  </dd>
                </dl>
              </>
            )}
            empty="No section views yet"
            emptyHint="Section dwell needs a visit that scrolls."
          />
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">Scroll reach</CardTitle>
          <p className="text-xs text-muted-foreground">
            Share of sessions that reached each depth. The denominator is every
            session that started, not only those that reported a milestone, 
            scoping to reporters puts every depth near 100% and says the
            opposite of the truth.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-4 gap-3 px-4">
          {(
            [
              ['25%', s.d25],
              ['50%', s.d50],
              ['75%', s.d75],
              ['100%', s.d100],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                {label}
              </p>
              <p className="font-mono text-lg tabular-nums">
                {pct(ratio(value, s.sessions))}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {num(value)} of {num(s.sessions)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Breakdown title="Devices" rows={data.devices} />
        <Breakdown title="Browsers" rows={data.browsers} />
        <Breakdown title="Referrers" rows={data.sources} />
      </div>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">
            Résumé against Experience mode
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            The two are different layouts, so they are counted separately.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 px-4 sm:grid-cols-2">
          {data.modes.map((m) => (
            <div key={m.mode} className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Badge variant={m.mode === 'immersive' ? 'default' : 'outline'}>
                  {m.mode === 'immersive' ? 'Experience' : 'Résumé'}
                </Badge>
                <span className="font-mono text-sm tabular-nums">
                  {num(m.sessions)}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {duration(m.avgSeconds)} average, {m.avgSections.toFixed(1)}{' '}
                sections
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
