'use client';
/**
 * What gets clicked, what was seen but not clicked, and what does nothing.
 *
 * The CTA table is the one the source system never populated: its own notes
 * record that `src/` contained zero tag attributes, so its impression
 * denominator was permanently empty. The tag pass in Portfolio.tsx exists so
 * this table has something to say on day one.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { sectionLabel } from '@/lib/analytics/section-catalogue';
import type { Overview } from '@/lib/analytics/types';
import { DataTable, NumCell, TableCell } from './DataTable';
import { num, pct } from './analytics-format';

export function ClicksPanel({ data }: { data: Overview }) {
  return (
    <>
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">
            What gets clicked
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Named rows carry a <code className="font-mono">data-track-tag</code>
            ; the rest are described from the element itself.
          </p>
        </CardHeader>
        <CardContent className="px-4">
          <DataTable
            rows={data.clicks}
            rowKey={(r, i) => `${r.label}-${r.section ?? ''}-${i}`}
            defaultSort={{ key: 'clicks', dir: 'desc' }}
            columns={[
              { key: 'label', label: 'Element', sortValue: (r) => r.label },
              {
                key: 'section',
                label: 'Section',
                sortValue: (r) => r.section ?? '',
              },
              {
                key: 'clicks',
                label: 'Clicks',
                align: 'right',
                sortValue: (r) => r.clicks,
                descFirst: true,
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
                <TableCell className="font-mono text-xs">
                  {r.label}
                  {r.tagged ? null : (
                    <Badge variant="outline" className="ml-2">
                      derived
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.section ? sectionLabel(r.section) : 'n/a'}
                </TableCell>
                <NumCell>{num(r.clicks)}</NumCell>
                <NumCell>{num(r.sessions)}</NumCell>
              </>
            )}
            renderCard={(r) => (
              <>
                <p className="font-mono">{r.label}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {r.section ? sectionLabel(r.section) : 'no section'} ·{' '}
                  {num(r.clicks)} clicks · {num(r.sessions)} sessions
                </p>
              </>
            )}
            empty="No clicks recorded yet"
          />
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">
            Seen against clicked
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            A control counts as seen once half of it held the screen for a full
            second. Rate is blank, not zero, when nothing was ever seen, a
            rate with no denominator is unknown, and 0% would claim the control
            was shown and ignored.
          </p>
        </CardHeader>
        <CardContent className="px-4">
          <DataTable
            rows={data.ctas}
            rowKey={(r) => r.tag}
            defaultSort={{ key: 'seen', dir: 'desc' }}
            columns={[
              { key: 'tag', label: 'Control', sortValue: (r) => r.tag },
              {
                key: 'seen',
                label: 'Seen by',
                align: 'right',
                sortValue: (r) => r.seenSessions,
                descFirst: true,
              },
              {
                key: 'clicked',
                label: 'Clicked by',
                align: 'right',
                sortValue: (r) => r.clickedSessions,
                descFirst: true,
              },
              {
                key: 'ctr',
                label: 'Rate',
                align: 'right',
                sortValue: (r) => r.ctr,
                descFirst: true,
              },
            ]}
            renderRow={(r) => (
              <>
                <TableCell className="font-mono text-xs">{r.tag}</TableCell>
                <NumCell>{num(r.seenSessions)}</NumCell>
                <NumCell>{num(r.clickedSessions)}</NumCell>
                <NumCell>{pct(r.ctr)}</NumCell>
              </>
            )}
            renderCard={(r) => (
              <>
                <p className="font-mono">{r.tag}</p>
                <p className="mt-0.5 text-muted-foreground">
                  seen {num(r.seenSessions)} · clicked{' '}
                  {num(r.clickedSessions)} · {pct(r.ctr)}
                </p>
              </>
            )}
            empty="No impressions yet"
            emptyHint="Tagged controls report an impression once genuinely seen."
          />
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">Friction</CardTitle>
          <p className="text-xs text-muted-foreground">
            Dead clicks hit nothing interactive; rage clicks are three or more
            in one spot inside 700ms. Without these, a cold spot on the heatmap
            is ambiguous, nobody clicked there, or everyone did and nothing
            happened.
          </p>
        </CardHeader>
        <CardContent className="px-4">
          <DataTable
            rows={data.friction}
            rowKey={(r, i) => `${r.kind}-${r.selector ?? ''}-${i}`}
            defaultSort={{ key: 'events', dir: 'desc' }}
            columns={[
              { key: 'kind', label: 'Kind', sortValue: (r) => r.kind },
              {
                key: 'section',
                label: 'Section',
                sortValue: (r) => r.section ?? '',
              },
              {
                key: 'selector',
                label: 'Nearest element',
                sortValue: (r) => r.selector ?? '',
              },
              {
                key: 'events',
                label: 'Events',
                align: 'right',
                sortValue: (r) => r.events,
                descFirst: true,
              },
            ]}
            renderRow={(r) => (
              <>
                <TableCell>
                  <Badge
                    variant={r.kind === 'rage' ? 'destructive' : 'outline'}
                  >
                    {r.kind}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.section ? sectionLabel(r.section) : 'n/a'}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.selector ?? 'n/a'}
                </TableCell>
                <NumCell>{num(r.events)}</NumCell>
              </>
            )}
            renderCard={(r) => (
              <>
                <p>
                  <Badge
                    variant={r.kind === 'rage' ? 'destructive' : 'outline'}
                  >
                    {r.kind}
                  </Badge>{' '}
                  <span className="font-mono">{r.selector ?? 'n/a'}</span>
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {r.section ? sectionLabel(r.section) : 'no section'} ·{' '}
                  {num(r.events)} events
                </p>
              </>
            )}
            empty="No friction recorded"
            emptyHint="Good news, or not enough traffic yet."
          />
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">
            Last click before leaving
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Split by whether the visit then reached out. Without the split, a
            dead end and a win rank side by side.
          </p>
        </CardHeader>
        <CardContent className="px-4">
          <DataTable
            rows={data.exitClicks}
            rowKey={(r, i) => `${r.label}-${i}`}
            defaultSort={{ key: 'sessions', dir: 'desc' }}
            columns={[
              { key: 'label', label: 'Last click', sortValue: (r) => r.label },
              {
                key: 'sessions',
                label: 'Sessions',
                align: 'right',
                sortValue: (r) => r.sessions,
                descFirst: true,
              },
              {
                key: 'converted',
                label: 'Then reached out',
                align: 'right',
                sortValue: (r) => r.converted,
                descFirst: true,
              },
            ]}
            renderRow={(r) => (
              <>
                <TableCell className="font-mono text-xs">{r.label}</TableCell>
                <NumCell>{num(r.sessions)}</NumCell>
                <NumCell>{num(r.converted)}</NumCell>
              </>
            )}
            renderCard={(r) => (
              <>
                <p className="font-mono">{r.label}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {num(r.sessions)} sessions · {num(r.converted)} reached out
                </p>
              </>
            )}
            empty="No exit clicks yet"
          />
        </CardContent>
      </Card>
    </>
  );
}
