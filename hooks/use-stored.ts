'use client';
/**
 * A localStorage value, read the way React wants external state read.
 *
 * The obvious implementation, `useState` plus a `useEffect` that reads
 * storage, is what `hooks/use-mobile.ts` does, and oxlint's
 * `react/react-compiler` rule rejects it as EffectSetState. It is also
 * genuinely a subscription: another tab can change the value, and two
 * components reading the same key should agree.
 *
 * `useSyncExternalStore` is the right tool. The snapshot is a **string** so it
 * is referentially stable, returning a fresh object each call is the classic
 * way to make React re-render forever, and `getServerSnapshot` supplies the
 * fallback during SSR, where there is no storage at all.
 */
import { useCallback, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab writing the same key should be reflected here too.
  const onStorage = () => listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function read(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    // Private mode, or storage blocked. The fallback is the answer.
    return fallback;
  }
}

export function useStored(
  key: string,
  fallback: string,
): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );

  const set = useCallback(
    (next: string) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        /* private mode, the choice simply does not persist */
      }
      // Same-tab writes do not fire `storage`, so tell subscribers ourselves.
      notify();
    },
    [key],
  );

  return [value, set];
}

/** Same, for a value stored as `'1'` / absent. */
export function useStoredFlag(
  key: string,
  fallback: boolean,
): [boolean, (value: boolean) => void] {
  const [raw, setRaw] = useStored(key, fallback ? 'true' : 'false');
  const set = useCallback(
    (next: boolean) => setRaw(next ? 'true' : 'false'),
    [setRaw],
  );
  return [raw !== 'false', set];
}

/** A media query, subscribed rather than sampled. */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  return useSyncExternalStore(
    useCallback(
      (listener: () => void) => {
        const media = matchMedia(query);
        media.addEventListener('change', listener);
        return () => media.removeEventListener('change', listener);
      },
      [query],
    ),
    useCallback(() => matchMedia(query).matches, [query]),
    () => fallback,
  );
}
