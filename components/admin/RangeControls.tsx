'use client';
/**
 * The date range and the internal-traffic switch, one control bar, and the
 * only place either value is owned.
 *
 * Every sub-panel is *given* the resolved range and the flag. Letting a panel
 * own its own toggle is how two panels end up disagreeing about the same week
 * with nothing on screen to explain why.
 *
 * ── Native <input type="date">, not ui/calendar.tsx ────────────────────────
 * calendar.tsx would pull react-day-picker and date-fns into the admin bundle
 * for a control used on one of six presets. A native input is 0 bytes, gives a
 * real date wheel on mobile, and is capped at today either way. The part that
 * actually matters, that the day boundary is Asia/Kolkata and not the
 * viewer's, lives in lib/analytics/time.ts, and no picker would have given us
 * that.
 *
 * ── The ToggleGroup wrapper ───────────────────────────────────────────────
 * Base UI's ToggleGroup is array-valued (it is built for multi-select), so a
 * single-select preset row has to wrap in and out of a one-element array. Worth
 * it for roving focus and arrow-key navigation, which hand-rolled buttons with
 * aria-pressed do not get. Deselection yields `[]` and is ignored: a range must
 * always be selected.
 */
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { RANGE_PRESETS, type RangeId } from '@/lib/analytics/time';
import { useIstToday } from '@/hooks/use-ist-today';

export function RangeControls({
  rangeId,
  custom,
  excludeInternal,
  loading,
  onRangeId,
  onCustom,
  onExcludeInternal,
  onRefresh,
}: {
  rangeId: RangeId;
  custom: { from: string; to: string };
  excludeInternal: boolean;
  loading: boolean;
  onRangeId: (id: RangeId) => void;
  onCustom: (c: { from: string; to: string }) => void;
  onExcludeInternal: (v: boolean) => void;
  onRefresh: () => void;
}) {
  // The clock is external state. Reading Date.now() during render is both
  // impure and wrong across a midnight boundary.
  const today = useIstToday();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        value={[rangeId]}
        onValueChange={(next: string[]) => {
          const picked = next[0];
          if (picked) onRangeId(picked as RangeId);
        }}
        variant="outline"
        size="sm"
        aria-label="Date range"
      >
        {RANGE_PRESETS.map((preset) => (
          <ToggleGroupItem key={preset.id} value={preset.id}>
            {preset.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {rangeId === 'custom' ? (
        <span className="flex items-center gap-1.5 text-xs">
          <input
            type="date"
            value={custom.from}
            max={today}
            onChange={(e) => onCustom({ ...custom, from: e.target.value })}
            className="rounded-md border bg-card px-2 py-1 font-mono"
            aria-label="From date"
          />
          <span className="text-muted-foreground">to</span>
          <input
            type="date"
            value={custom.to}
            max={today}
            onChange={(e) => onCustom({ ...custom, to: e.target.value })}
            className="rounded-md border bg-card px-2 py-1 font-mono"
            aria-label="To date"
          />
        </span>
      ) : null}

      {/*
        Two labelled states, not a checkbox. Each says what the numbers below
        it mean; an unchecked box says only that something is off.
      */}
      <ToggleGroup
        value={[excludeInternal ? 'real' : 'all']}
        onValueChange={(next: string[]) => {
          const picked = next[0];
          if (picked) onExcludeInternal(picked === 'real');
        }}
        variant="outline"
        size="sm"
        aria-label="Traffic filter"
      >
        <ToggleGroupItem value="real">Real visitors</ToggleGroupItem>
        <ToggleGroupItem value="all">All traffic</ToggleGroupItem>
      </ToggleGroup>

      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={loading}
      >
        {loading ? <Spinner className="size-3" /> : null}
        Refresh
      </Button>
    </div>
  );
}
