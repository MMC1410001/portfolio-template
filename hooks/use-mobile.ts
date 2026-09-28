import * as React from 'react';

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

// A media query is an external store, so it is read with useSyncExternalStore
// rather than mirrored into state from an effect (react-compiler rejects the
// setState-in-effect it replaced). The server snapshot is `false`, which is
// what the previous `!!undefined` returned before the first effect ran.
function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
