'use client';
/**
 * Catches a failure in the lazy 3D scene and renders the 2D fallback instead.
 *
 * This closes a real gap the analytics work uncovered rather than one it
 * created. `ImmersiveSystem` wraps `<Scene>` in `<Suspense>`, and SystemScene
 * has its own boundary around the R3F canvas, but nothing sat between
 * `Suspense` and a **chunk-load** rejection. `import('./SystemScene')` failing
 * (offline mid-session, or a stale hashed chunk after a redeploy) threw past
 * Suspense and took the whole page down, résumé and all.
 *
 * A class component because `componentDidCatch` has no hook equivalent.
 *
 * `scope` is what makes the two failures distinguishable in the panel:
 * 'immersive-chunk' is a download that never arrived, 'immersive-scene' is
 * WebGL giving up once it did. They have entirely different fixes.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback: ReactNode;
  onError: (scope: 'immersive-chunk') => void;
}

export default class SceneBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Reported, not rethrown: the visitor keeps a working page and we still
    // learn the scene is unreachable for them.
    console.error('[portfolio] immersive scene failed to load', error, info);
    this.props.onError('immersive-chunk');
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
