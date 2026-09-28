'use client';
/**
 * Catches a failure below a lazy boundary and renders a fallback instead of
 * letting it take the page down.
 *
 * The failure this was written for is a **chunk-load** rejection: `import()`
 * of a lazy chunk failing, offline mid-session or a stale hashed chunk after a
 * redeploy. `<Suspense>` only handles the pending state; a rejected import
 * throws straight past it, and without a boundary above it the whole page
 * unmounts, résumé and all.
 *
 * Which is why placement is the whole point. This used to sit *inside*
 * `ImmersiveSystem`, the very chunk whose download it was meant to survive: a
 * boundary in a module that never arrived cannot catch anything, so the one
 * failure it existed for still crashed the page. It now wraps the
 * `<Suspense>` around the lazy import in `Portfolio.tsx`, and around each lazy
 * recreation in `DashboardDetail.tsx`. `ImmersiveSystem` keeps an inner one
 * for the turntable itself, which is a different failure (the chunk arrived,
 * the canvas code threw) and gets a different fallback.
 *
 * A class component because `componentDidCatch` has no hook equivalent.
 *
 * `scope` is what makes the failures distinguishable in the panel's error
 * rows: 'immersive-chunk' and 'dashboard-chunk' are downloads that never
 * arrived, 'immersive-scene' is the turntable failing once it did. They have
 * entirely different fixes.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

export type BoundaryScope = 'immersive-chunk' | 'immersive-scene' | 'dashboard-chunk';

interface Props {
  children: ReactNode;
  fallback: ReactNode;
  scope: BoundaryScope;
  onError?: (scope: BoundaryScope) => void;
}

export default class SceneBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Reported, not rethrown: the visitor keeps a working page and we still
    // learn the feature is unreachable for them.
    console.error(`[portfolio] ${this.props.scope} failed`, error, info);
    this.props.onError?.(this.props.scope);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
