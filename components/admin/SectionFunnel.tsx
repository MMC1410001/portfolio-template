'use client';
/**
 * Sections in document order, with the share of sessions that reached each.
 *
 * ── Why this replaces the source system's conversion funnel ────────────────
 * Lumen's FunnelSteps expressed a purchase funnel with group restarts and
 * cross-group baselines. There is no conversion funnel here, no accounts, no
 * checkout, so that machinery has nothing to express. But the site *does*
 * have a funnel: a single page people fall out of on the way down, and the
 * step-to-step rate is the thing that says where.
 *
 * ── Why not a recharts Funnel ─────────────────────────────────────────────
 * The header comment on the original is right and carries over: a funnel chart
 * gives one number per bar and no room for the step-to-step figure, which is
 * the one that answers the question. Hand-rolled divs give both, plus a real
 * baseline every bar shares.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SECTIONS, sectionLabel } from '@/lib/analytics/section-catalogue';
import type { SectionRow } from '@/lib/analytics/types';
import { bandWidth, num, pct, ratio } from './analytics-format';

export function SectionFunnel({ rows }: { rows: SectionRow[] }) {
  const bySection = new Map(rows.map((r) => [r.path.replace(/^\/#/, ''), r]));
  // Document order, and only the sections that drive dwell, the two nested
  // blocks produce impressions instead, so they have no dwell row to show.
  const ordered = SECTIONS.filter((s) => s.level === 'section');

  const first = bySection.get(ordered[0]?.id ?? '')?.sessions ?? 0;
  const baseline = ordered.reduce(
    (m, s) => Math.max(m, bySection.get(s.id)?.sessions ?? 0),
    0,
  );

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium">
          How far down people get
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Sessions that spent at least a moment in each section, in page order.
          Step shows the share carried over from the section above.
        </p>
      </CardHeader>
      <CardContent className="px-4">
        <ul className="flex flex-col gap-2.5">
          {ordered.map((section, i) => {
            const row = bySection.get(section.id);
            const sessions = row?.sessions ?? 0;
            const prev =
              i === 0
                ? null
                : (bySection.get(ordered[i - 1].id)?.sessions ?? 0);
            const step = prev === null ? null : ratio(sessions, prev);

            return (
              <li key={section.id}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate">{sectionLabel(section.id)}</span>
                  <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                    {num(sessions)}
                    <span className="ml-2">
                      {pct(ratio(sessions, first || baseline))}
                    </span>
                    {/* Step rate is the point: it says where people are lost,
                        which the absolute share alone does not. */}
                    <span className="ml-2 text-[10px]">
                      {step === null ? 'n/a' : `step ${step}%`}
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[var(--color-chart-1)]"
                    style={{ width: `${bandWidth(sessions, baseline)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

