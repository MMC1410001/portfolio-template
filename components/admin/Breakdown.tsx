'use client';
/**
 * A labelled horizontal bar list, the panel's workhorse for "share of what".
 *
 * Two hand-rolled divs rather than `ui/progress.tsx`: Base UI's Progress is
 * five exported parts for what is a 6px bar here, and the bar needs to sit
 * inline with a label and a count rather than own a row.
 *
 * Bars are the right form for this and a pie is not: these lists routinely run
 * to a dozen categories, and comparing a dozen angles is guesswork where
 * comparing a dozen lengths against a shared baseline is not. The pies in the
 * audience panel are capped at three slices for the same reason.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Breakdown as BreakdownRow } from '@/lib/analytics/types';
import { num } from './analytics-format';

export function Breakdown({
  title,
  rows,
  limit = 8,
  empty = 'Nothing recorded in this period.',
}: {
  title: string;
  rows: BreakdownRow[];
  limit?: number;
  empty?: string;
}) {
  const shown = rows.slice(0, limit);
  const max = shown.reduce((m, r) => Math.max(m, r.sessions), 0);

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        {shown.length === 0 ? (
          <p className="text-xs text-muted-foreground">{empty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shown.map((row) => (
              <li key={row.label} className="text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate" title={row.label}>
                    {row.label}
                  </span>
                  {/* Text keeps text tokens; the bar alone carries the value. */}
                  <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                    {num(row.sessions)}
                    <span className="ml-1.5">{row.share}%</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[var(--color-chart-1)]"
                    style={{
                      // Against the largest row, not the total: with a long
                      // tail every bar would otherwise be a sliver.
                      width: `${max > 0 ? Math.max(2, (row.sessions / max) * 100) : 0}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {rows.length > limit ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            +{rows.length - limit} more
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
