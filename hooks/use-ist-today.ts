'use client';
/**
 * Today's IST calendar date, as 'YYYY-MM-DD'.
 *
 * The clock is external state, so it is read through useSyncExternalStore
 * rather than sampled during render. Two reasons, and the second is the real
 * one: `Date.now()` in a render body is impure (oxlint's react-compiler rule
 * rejects it), and a value captured once at module load would be wrong for
 * anyone who leaves the panel open across midnight.
 *
 * The snapshot is a string, so it is referentially stable for a whole day and
 * cannot cause a render loop. The subscription ticks once a minute, cheap,
 * and it means the date input's `max` moves on its own at 00:00 IST.
 */
import { useSyncExternalStore } from 'react';
import { istDayKey } from '@/lib/analytics/time';

const TICK_MS = 60_000;

function subscribe(listener: () => void): () => void {
  const id = setInterval(listener, TICK_MS);
  return () => clearInterval(id);
}

const getSnapshot = () => istDayKey(Date.now());
// The server has no meaningful "today" for the viewer, and the value is only
// used as an input bound, so an empty max is the safe SSR answer.
const getServerSnapshot = () => '';

export function useIstToday(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
