/**
 * DOM helpers shared by the browser-side recorders (sections.ts, cta.ts,
 * scroll.ts). Browser-only by intent: normalise.ts and section-catalogue.ts
 * must stay importable by a bare Node process, so anything that touches
 * `document` or `window` lives here rather than there.
 */

/**
 * The document height a depth or a dwell row is measured against.
 *
 * Unrounded on purpose. scrollHeight and innerHeight are integers in every
 * engine, so rounding here would change nothing a browser reports, but the
 * callers decide: scroll.ts divides by it and rounds the percentage, and
 * every emitted `doc_h` is rounded where it is emitted, so a fractional value
 * from a stubbed DOM can never reach the event log either way.
 */
export function docHeight(): number {
  const doc = document.documentElement;
  return Math.max(doc.scrollHeight, window.innerHeight, 1);
}

/**
 * A MutationObserver callback that re-runs `scan` after DOM changes, debounced
 * by `ms`, and only for batches that added an element.
 *
 * The turntable rewrites its degree readout's textContent on every scroll
 * frame, which is a childList mutation adding a Text node. No tag or section
 * can arrive in a Text node, so those batches are skipped outright, and a
 * burst of real ones (a chunk mounting) costs one scan rather than dozens.
 * `cancel()` drops a pending scan, for an uninstall.
 */
export function debouncedScan(ms: number, scan: () => void): { schedule: (records: MutationRecord[]) => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule(records) {
      if (timer !== null) return;
      const added = records.some((r) => Array.from(r.addedNodes).some((n) => n.nodeType === 1));
      if (!added) return;
      timer = setTimeout(() => {
        timer = null;
        scan();
      }, ms);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
