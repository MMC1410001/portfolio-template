/**
 * Should this page report analytics at all?
 *
 * Four reasons it should not: being embedded, being /admin, the visitor having
 * excluded themselves, and the build-time kill switch. All are contexts where
 * recording would describe us rather than a visitor.
 *
 * Its own module to avoid a cycle: queue.ts imports ensureSessionId from
 * session.ts, so session.ts cannot import back from queue.ts. Both need this.
 *
 * See also isHeatmapPreview() at the foot of the file, which answers a
 * different question about the same iframe: not "should this be recorded" but
 * "should this page freeze itself so the heatmap is honest".
 */

import { normalisePath } from './normalise';

/** Set by the visitor, via the panel's "Stop counting my visits" button. */
const SELF_EXCLUDE_KEY = 'pfInternal';

/**
 * Build-time opt-out.
 *
 * `process.env.NEXT_PUBLIC_*` rather than `import.meta.env`: vinext's dotenv
 * loader inlines only the NEXT_PUBLIC_ prefix into the client bundle, so this
 * is the one form that actually reaches the browser.
 */
function killSwitched(): boolean {
  return process.env.NEXT_PUBLIC_ANALYTICS_DISABLED === 'true';
}

/**
 * Is this document inside a frame?
 *
 * `?embed=true` is the flag the admin heatmap sets. Without this guard, opening
 * the heatmap writes visit, page_view and click rows into the very table the
 * panel is reading, looking at the data would change it.
 */
export function isEmbedded(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('embed') === 'true') return true;
    // Belt and braces for a frame that was not given the flag.
    return window.self !== window.top;
  } catch {
    // Reading window.top cross-origin throws, which itself means framed.
    return true;
  }
}

/** Paths that are not visitor usage. /admin is us looking at the data. */
const UNTRACKED_PREFIXES = ['/admin'];

export function isUntrackedPath(pathname: string): boolean {
  const path = normalisePath(pathname);
  return UNTRACKED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Has the visitor asked not to be counted?
 *
 * A genuine improvement on the source system, which could only exclude traffic
 * by CIDR, and then measured its own office leaving by three different ISPs
 * across three consecutive requests, so the CIDR list never quite worked. One
 * click, no network archaeology, works from anywhere.
 */
export function selfExcluded(): boolean {
  try {
    return localStorage.getItem(SELF_EXCLUDE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSelfExcluded(on: boolean): void {
  try {
    if (on) localStorage.setItem(SELF_EXCLUDE_KEY, '1');
    else localStorage.removeItem(SELF_EXCLUDE_KEY);
  } catch {
    /* private mode, nothing to store, and nothing was being recorded anyway */
  }
}

/** The single question every recording path asks before writing anything. */
export function trackingSuppressed(): boolean {
  try {
    if (killSwitched()) return true;
    if (isEmbedded()) return true;
    if (isUntrackedPath(window.location.pathname)) return true;
    return selfExcluded();
  } catch {
    return true;
  }
}

/**
 * Is this page the backdrop of the /admin heatmap?
 *
 * Requires **all three** conditions, and the third is the one that matters:
 *
 *   1. ?embed=true,  framed by us
 *   2. ?preview=heatmap, this specific use, not embedding in general
 *   3. framed by US,  a parent frame on our own origin
 *
 * Callers use it to freeze the page: no idle auto-reveal, no `.dark` toggle, no
 * three.js chunk, no chat launcher. A page that mutates itself while being
 * screenshotted produces a heatmap drawn over a layout no visitor ever saw.
 *
 * Being framed is something ANY page on the internet can arrange, so on its own
 * it is not evidence of anything. What we mean is "framed by the /admin panel",
 * and the checkable form of that is a parent on our own origin, reading
 * `window.parent.location.origin` throws SecurityError cross-origin, which is
 * precisely the signal we want.
 *
 * The `catch` therefore returns FALSE: a throw proves the parent is somebody
 * else's. Do not relax this to two conditions.
 */
export function isHeatmapPreview(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('embed') !== 'true') return false;
    if (params.get('preview') !== 'heatmap') return false;
    // Not framed at all, a hand-typed URL in a real tab.
    if (window.self === window.top) return false;
    // Framed by whom? Only our own origin may freeze the page.
    return window.parent.location.origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Which layout the heatmap wants behind it.
 *
 * Résumé and immersive are different layouts, `.resume-title` and
 * `.resume-aside` go `display:none`, `.system-stage` becomes absolute, `.hero`
 * changes its grid, so one merged heatmap over one of them is a lie about half
 * the clicks. The panel appends `&preview_mode=immersive` and Portfolio.tsx
 * starts frozen in that mode.
 */
export function previewMode(): 'resume' | 'immersive' {
  try {
    const value = new URLSearchParams(window.location.search).get(
      'preview_mode',
    );
    return value === 'immersive' ? 'immersive' : 'resume';
  } catch {
    return 'resume';
  }
}
