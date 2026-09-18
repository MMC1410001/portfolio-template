'use client';
/**
 * Is this document the frozen backdrop of the /admin heatmap?
 *
 * False on the server and on the first client paint, then the real answer.
 *
 * ── Why useSyncExternalStore and not useState + useEffect ──────────────────
 * Portfolio.tsx is a client component that vinext server-renders, so reading
 * `window.location.search` in a `useState` initialiser would run on the server
 * where `window` is undefined, and guarding it makes the server say false and
 * the client say true on the preview URL, which is a hydration mismatch.
 *
 * The obvious fix (set state in an effect) is what `hooks/use-mobile.ts` does,
 * and oxlint's `react/react-compiler` rule rejects it as EffectSetState. This
 * hook is exactly what useSyncExternalStore's `getServerSnapshot` is for: two
 * legitimately different answers either side of hydration, resolved by React
 * without a mismatch warning and without a cascading render.
 *
 * The snapshot is a **string, not an object**: getSnapshot must be
 * referentially stable or React re-renders forever, and a fresh object literal
 * each call is the classic way to trigger that.
 *
 * `subscribe` is a no-op returning an empty cleanup, the answer is fixed by
 * the URL for the life of the document, so there is nothing to subscribe to.
 *
 * Reading the URL directly is also deliberate: `useSearchParams()` bails out to
 * client rendering and would force a Suspense boundary around <Portfolio/>,
 * and the server `searchParams` prop makes `/` dynamic. Both would cost the
 * public homepage something to serve an admin-only feature.
 */
import { useSyncExternalStore } from 'react';
import { isHeatmapPreview, previewMode } from '@/lib/analytics/scope';

type Snapshot = 'off' | 'resume' | 'immersive';

const subscribe = () => () => {};
const getSnapshot = (): Snapshot =>
  isHeatmapPreview() ? previewMode() : 'off';
const getServerSnapshot = (): Snapshot => 'off';

export function useHeatmapPreview(): {
  preview: boolean;
  mode: 'resume' | 'immersive';
} {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return {
    preview: snapshot !== 'off',
    mode: snapshot === 'immersive' ? 'immersive' : 'resume',
  };
}
