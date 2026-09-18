'use client';
/**
 * Bridges Portfolio.tsx's mode state machine to the analytics mode recorder.
 *
 * The trigger is passed explicitly rather than inferred, and that distinction
 * is the whole point: `reveal()` is called from three places, the header's
 * `.mode-control` button, the hero's `.reveal-link`, and the idle countdown
 * reaching zero. Only the third answers "does the 10-second auto-reveal work,
 * or does it fire after everyone has already left?"
 *
 * `'transitioning'` is folded into `'immersive'`: it lasts 850ms, it is an
 * animation state, and a third bucket would mean nothing.
 */
import { useCallback, useEffect, useRef } from 'react';
import { recordModeChange, type ModeTrigger } from '@/lib/analytics/mode';

type PortfolioMode = 'resume' | 'transitioning' | 'immersive';

export function useModeTracking(
  mode: PortfolioMode,
  reduced: boolean,
  preview: boolean,
): { note: (trigger: 'timer' | 'manual') => void } {
  /**
   * The trigger for the change that is about to happen.
   *
   * reveal() and returnToResume() run before React commits the new mode, so
   * the call site records its intent here and the effect below reads it once
   * the settled mode arrives. A ref rather than state because it must not
   * cause a render, and it is written in an event handler. Never during
   * render, which oxlint's react/react-compiler rule forbids.
   */
  const pending = useRef<ModeTrigger | null>(null);

  const note = useCallback((trigger: 'timer' | 'manual') => {
    pending.current = trigger;
  }, []);

  useEffect(() => {
    // The preview freezes the mode on purpose; recording it would file the
    // panel's own screenshot as a visitor switching layouts.
    if (preview) return;

    const settled = mode === 'resume' ? 'resume' : 'immersive';
    const trigger: ModeTrigger =
      pending.current ?? (reduced ? 'reduced-motion' : 'manual');
    pending.current = null;

    recordModeChange(settled, trigger, { reduced_motion: reduced });
  }, [mode, reduced, preview]);

  return { note };
}
