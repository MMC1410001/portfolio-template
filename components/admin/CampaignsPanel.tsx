'use client';
/**
 * Tagged links and ad clicks.
 *
 * Every user and revenue column from the source system is gone, no accounts,
 * no checkout, which makes this the biggest simplification in the whole port:
 * three FULL OUTER JOINs collapsed into one GROUP BY.
 *
 * `content` stays a grouping key rather than a picked column, because a
 * campaign is usually several creatives and "which creative worked" is the
 * whole point of tagging one.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Campaigns } from '@/lib/analytics/types';
import { DataTable, NumCell, TableCell } from './DataTable';
import { StatTile } from './StatTile';
import { num, pct, ratio } from './analytics-format';

export function CampaignsPanel({ data }: { data: Campaigns }) {
  const total = data.totals.tagged + data.totals.untagged;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          label="Tagged sessions"
          value={num(data.totals.tagged)}
          note={pct(ratio(data.totals.tagged, total)) + ' of all sessions'}
        />
        <StatTile
          label="Untagged"
          value={num(data.totals.untagged)}
          note="Direct, organic, or an untagged share"
        />
        <StatTile
          label="Campaigns seen"
          value={num(data.campaigns.length)}
        />
      </div>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">Campaigns</CardTitle>
          <p className="text-xs text-muted-foreground">
            Values are lowercased on the way in, so <code>LinkedIn</code> and{' '}
            <code>linkedin</code> are one row rather than two. Anything
            resembling personal information (an email, a long number) is
            rejected whole rather than trimmed, because a trimmed campaign name
            is a different campaign that looks real.
          </p>
        </CardHeader>
        <CardContent className="px-4">
          <DataTable
            rows={data.campaigns}
            rowKey={(r, i) =>
              `${r.source ?? ''}-${r.campaign ?? ''}-${r.content ?? ''}-${i}`
            }
            defaultSort={{ key: 'sessions', dir: 'desc' }}
            columns={[
              {
                key: 'source',
                label: 'Source',
                sortValue: (r) => r.source ?? '',
              },
              {
                key: 'medium',
                label: 'Medium',
                sortValue: (r) => r.medium ?? '',
              },
              {
                key: 'campaign',
                label: 'Campaign',
                sortValue: (r) => r.campaign ?? '',
              },
              {
                key: 'content',
                label: 'Creative',
                sortValue: (r) => r.content ?? '',
              },
              {
                key: 'sessions',
                label: 'Sessions',
                align: 'right',
                sortValue: (r) => r.sessions,
                descFirst: true,
              },
              {
                key: 'reached',
                label: 'Reached out',
                align: 'right',
                sortValue: (r) => r.reachedOut,
                descFirst: true,
              },
            ]}
            renderRow={(r) => (
              <>
                <TableCell>{r.source ?? 'n/a'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.medium ?? 'n/a'}
                </TableCell>
                <TableCell>{r.campaign ?? 'n/a'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.content ?? 'n/a'}
                </TableCell>
                <NumCell>{num(r.sessions)}</NumCell>
                <NumCell>
                  {num(r.reachedOut)}
                  <span className="ml-1 text-muted-foreground">
                    {pct(ratio(r.reachedOut, r.sessions))}
                  </span>
                </NumCell>
              </>
            )}
            renderCard={(r) => (
              <>
                <p className="font-medium">
                  {r.source ?? 'n/a'}
                  {r.campaign ? ` · ${r.campaign}` : ''}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {r.medium ?? 'no medium'}
                  {r.content ? ` · ${r.content}` : ''}
                </p>
                <p className="mt-0.5 font-mono tabular-nums">
                  {num(r.sessions)} sessions · {num(r.reachedOut)} reached out
                </p>
              </>
            )}
            empty="No tagged traffic yet"
            emptyHint="Add ?utm_source=… to a link you share to see it here."
          />
        </CardContent>
      </Card>
    </>
  );
}
