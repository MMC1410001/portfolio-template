'use client';
/**
 * States which traffic the numbers below include, in one sentence.
 *
 * The CRUD half of the source system's internal-traffic page is gone, CIDRs
 * are env vars here, but the notice stays, because the wording *is* the
 * feature. See describeInternal() for why four states must read differently
 * even when two of them show identical totals.
 *
 * Also carries the self-exclusion switch, which is a genuine improvement on
 * the source system: it could only exclude traffic by CIDR, and it measured
 * its own office leaving by three different ISPs across three consecutive
 * requests. One click, no network archaeology, works from anywhere.
 */
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStored } from '@/hooks/use-stored';
import type { InternalNotice as Summary } from '@/lib/analytics/types';
import { describeInternal } from './analytics-format';
import { cn } from '@/lib/utils';

export function InternalNotice({ summary }: { summary?: Summary }) {
  const notice = describeInternal(summary);
  // The same key lib/analytics/scope.ts reads, so flipping it here suppresses
  // recording immediately without a reload.
  const [flag, setFlag] = useStored('pfInternal', '0');
  const excluded = flag === '1';

  if (!notice) return null;

  return (
    <Card
      className={cn(
        'gap-0 py-3',
        notice.tone === 'warn' && 'border-destructive/40 bg-destructive/5',
      )}
    >
      <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4">
        <div className="min-w-0">
          <p
            className={cn(
              'text-xs font-medium',
              notice.tone === 'warn' && 'text-destructive',
            )}
          >
            {notice.headline}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {notice.detail}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFlag(excluded ? '0' : '1')}
        >
          {excluded ? 'Count my visits again' : 'Stop counting my visits'}
        </Button>
      </CardContent>
    </Card>
  );
}
