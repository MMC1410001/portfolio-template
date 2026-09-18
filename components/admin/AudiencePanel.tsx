'use client';
/**
 * New against returning, devices, and rough location.
 *
 * ── Pies capped at three slices ────────────────────────────────────────────
 * `topTwoPlusOther` is ported verbatim, and the reason is not cosmetic: a pie
 * asks the reader to compare angles in an all-pairs form, and three is the
 * validated ceiling for that before a fourth hue stops being separable for
 * colour-blind readers. Everything past two folds into "Other", and the full
 * list is right beside it as a bar breakdown, which *is* readable at a dozen
 * categories.
 *
 * ── Colour follows the entity, not its rank ────────────────────────────────
 * Slices are indexed by their position in the folded list, which is derived
 * from a stable sort, so toggling Real visitors / All traffic cannot repaint
 * the chart mid-comparison.
 */
import { Pie, PieChart } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Audience, Breakdown as Row } from '@/lib/analytics/types';
import { DataTable, NumCell, TableCell } from './DataTable';
import { Breakdown } from './Breakdown';
import { StatTile } from './StatTile';
import { num, pct, ratio, topTwoPlusOther } from './analytics-format';

const SLICES = ['var(--chart-1)', 'var(--chart-3)', 'var(--chart-5)'];

function SharePie({ title, rows }: { title: string; rows: Row[] }) {
  const folded = topTwoPlusOther(rows).map((r, i) => ({
    ...r,
    fill: SLICES[i],
  }));
  const config = Object.fromEntries(
    folded.map((r, i) => [r.label, { label: r.label, color: SLICES[i] }]),
  ) satisfies ChartConfig;

  if (folded.length === 0) {
    return (
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <p className="text-xs text-muted-foreground">
            Nothing recorded in this period.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <ChartContainer config={config} className="aspect-auto h-40 w-full">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Pie
              data={folded}
              dataKey="sessions"
              nameKey="label"
              innerRadius={34}
              outerRadius={64}
              paddingAngle={2}
              // A 2px surface ring between slices, so adjacent fills read as
              // separate marks rather than one blended arc.
              stroke="var(--color-card)"
              strokeWidth={2}
            />
          </PieChart>
        </ChartContainer>
        {/* Direct labels, so identity never rests on colour alone, and they
            double as the relief the light-mode contrast warning requires. */}
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {folded.map((r, i) => (
            <li key={r.label} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ background: SLICES[i] }}
              />
              <span>{r.label}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {r.share}%
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function AudiencePanel({ data }: { data: Audience }) {
  const total = data.visitors.new + data.visitors.returning;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="New visitors" value={num(data.visitors.new)} />
        <StatTile
          label="Returning"
          value={num(data.visitors.returning)}
          note={pct(ratio(data.visitors.returning, total)) + ' of identified'}
        />
        <StatTile
          label="Engaged"
          value={`${data.engagementRate}%`}
          note="More than one section, or 10s+"
        />
        <StatTile
          label="Unidentified"
          value={num(data.visitors.unknown)}
          note="No stored visitor id, private mode, or storage blocked"
          tone="muted"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        New against returning is judged by looking for the same browser before
        this window, so it is bounded by the {data.meta.retentionDays}-day
        retention horizon: a visitor last seen before that now counts as new.
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        <SharePie title="Devices" rows={data.devices} />
        <SharePie title="Operating systems" rows={data.os} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Breakdown title="Devices, in full" rows={data.devices} />
        <Breakdown title="Operating systems, in full" rows={data.os} />
      </div>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">Where from</CardTitle>
          <p className="text-xs text-muted-foreground">
            {data.geoAvailable
              ? 'A regional hint, not a fact. Mobile carriers route whole ' +
                'states through one city, so treat these as approximate.'
              : 'No location data in this period. Local development never has ' +
                'any (the dev runtime supplies a stubbed request) so this ' +
                'reads as unavailable rather than as zero.'}
          </p>
        </CardHeader>
        <CardContent className="px-4">
          <DataTable
            rows={data.cities}
            rowKey={(r, i) => `${r.city}-${r.region ?? ''}-${i}`}
            defaultSort={{ key: 'sessions', dir: 'desc' }}
            columns={[
              { key: 'city', label: 'City', sortValue: (r) => r.city },
              {
                key: 'region',
                label: 'Region',
                sortValue: (r) => r.region ?? '',
              },
              {
                key: 'country',
                label: 'Country',
                sortValue: (r) => r.country ?? '',
              },
              {
                key: 'sessions',
                label: 'Sessions',
                align: 'right',
                sortValue: (r) => r.sessions,
                descFirst: true,
              },
            ]}
            renderRow={(r) => (
              <>
                <TableCell>{r.city}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.region ?? 'n/a'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.country ?? 'n/a'}
                </TableCell>
                <NumCell>{num(r.sessions)}</NumCell>
              </>
            )}
            renderCard={(r) => (
              <>
                <p className="font-medium">{r.city}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {[r.region, r.country].filter(Boolean).join(', ') || 'n/a'} ·{' '}
                  {num(r.sessions)} sessions
                </p>
              </>
            )}
            empty="No location data"
            emptyHint="Available in production only."
          />
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">Source and medium</CardTitle>
          <p className="text-xs text-muted-foreground">
            An ad click is resolved before its referrer, because a paid click
            arrives <em>from</em> the search engine and referrer-first
            bucketing would file every ad as organic search.
          </p>
        </CardHeader>
        <CardContent className="px-4">
          <DataTable
            rows={data.sourceMedium}
            rowKey={(r, i) => `${r.source}-${r.medium}-${i}`}
            defaultSort={{ key: 'sessions', dir: 'desc' }}
            columns={[
              { key: 'source', label: 'Source', sortValue: (r) => r.source },
              { key: 'medium', label: 'Medium', sortValue: (r) => r.medium },
              { key: 'tagged', label: 'Via', sortValue: (r) => r.tagged },
              {
                key: 'sessions',
                label: 'Sessions',
                align: 'right',
                sortValue: (r) => r.sessions,
                descFirst: true,
              },
            ]}
            renderRow={(r) => (
              <>
                <TableCell>{r.source}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.medium}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.tagged}
                </TableCell>
                <NumCell>{num(r.sessions)}</NumCell>
              </>
            )}
            renderCard={(r) => (
              <>
                <p className="font-medium">{r.source}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {r.medium} · via {r.tagged} · {num(r.sessions)} sessions
                </p>
              </>
            )}
            empty="No sessions yet"
          />
        </CardContent>
      </Card>
    </>
  );
}
