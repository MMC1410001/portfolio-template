'use client';
/**
 * Individual visits, the tool you reach for when a number looks wrong.
 *
 * ── No IP column, because none is stored ───────────────────────────────────
 * The source system showed a raw address here to answer questions about
 * account abuse. There are no accounts on a portfolio, so an address would be
 * a privacy liability with no analytical payoff. A /24 or /48 prefix plus the
 * network operator replaces it: enough to recognise "this is my office" or
 * "this is one mobile carrier", not enough to identify a person.
 *
 * That difference is stated on screen rather than left to be discovered.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SessionRow } from '@/lib/analytics/types';
import { DataTable, NumCell, TableCell } from './DataTable';
import { duration, num } from './analytics-format';

function when(ms: number): string {
  return new Date(ms).toLocaleString('en-IN', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function SessionsPanel({ rows }: { rows: SessionRow[] }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium">Recent sessions</CardTitle>
        <p className="text-xs text-muted-foreground">
          No visitor IP address is stored anywhere. The network column is a /24
          or /48 prefix and the operator name, coarse on purpose.
        </p>
      </CardHeader>
      <CardContent className="px-4">
        <DataTable
          rows={rows}
          rowKey={(r) => r.sessionId}
          defaultSort={{ key: 'last', dir: 'desc' }}
          maxHeightClass="max-h-[32rem]"
          columns={[
            {
              key: 'last',
              label: 'Last seen',
              sortValue: (r) => r.lastSeen,
              descFirst: true,
            },
            {
              key: 'length',
              label: 'Length',
              align: 'right',
              sortValue: (r) => r.lastSeen - r.firstSeen,
              descFirst: true,
            },
            {
              key: 'events',
              label: 'Events',
              align: 'right',
              sortValue: (r) => r.events,
              descFirst: true,
            },
            { key: 'device', label: 'Device', sortValue: (r) => r.device ?? '' },
            { key: 'where', label: 'Where', sortValue: (r) => r.city ?? '' },
            {
              key: 'network',
              label: 'Network',
              sortValue: (r) => r.ipPrefix ?? '',
            },
          ]}
          renderRow={(r) => (
            <>
              <TableCell className="whitespace-nowrap">
                {when(r.lastSeen)}
                {r.isInternal ? (
                  <Badge variant="outline" className="ml-2">
                    internal
                  </Badge>
                ) : null}
              </TableCell>
              <NumCell>{duration((r.lastSeen - r.firstSeen) / 1000)}</NumCell>
              <NumCell>{num(r.events)}</NumCell>
              <TableCell className="text-muted-foreground">
                {[r.device, r.browser].filter(Boolean).join(' · ') || 'n/a'}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {[r.city, r.country].filter(Boolean).join(', ') || 'n/a'}
              </TableCell>
              <TableCell className="font-mono text-[11px] text-muted-foreground">
                {r.ipPrefix ?? 'n/a'}
                {r.asnOrg ? (
                  <span className="block truncate" title={r.asnOrg}>
                    {r.asnOrg}
                  </span>
                ) : null}
              </TableCell>
            </>
          )}
          renderCard={(r) => (
            <>
              <p className="font-medium">
                {when(r.lastSeen)}
                {r.isInternal ? (
                  <Badge variant="outline" className="ml-2">
                    internal
                  </Badge>
                ) : null}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {duration((r.lastSeen - r.firstSeen) / 1000)} ·{' '}
                {num(r.events)} events ·{' '}
                {[r.device, r.browser].filter(Boolean).join(' · ') || 'n/a'}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {[r.city, r.country].filter(Boolean).join(', ') || 'no location'}
                {r.ipPrefix ? ` · ${r.ipPrefix}` : ''}
              </p>
              {r.verbs ? (
                <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                  {r.verbs}
                </p>
              ) : null}
            </>
          )}
          empty="No sessions in this period"
        />
      </CardContent>
    </Card>
  );
}
