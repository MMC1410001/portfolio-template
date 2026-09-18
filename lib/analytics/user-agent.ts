/**
 * User-agent classification, done at write time.
 *
 * Derived here and stored in columns rather than parsed in SQL when the
 * dashboard asks. Two reasons: every aggregate would otherwise repeat the same
 * regex work over the whole log, and a UA string is a high-cardinality mess
 * that no GROUP BY can usefully bucket. It also matters more here than in the
 * source system, because SQLite registers no REGEXP function at all. There is
 * no SQL-side fallback.
 *
 * Deliberately coarse. The questions this answers are "is mobile behaving
 * differently from desktop" and "is anything broken in one browser", not
 * "which minor version of Chrome".
 *
 * Ported verbatim, including the two orderings that are load-bearing:
 *   - bots before Chrome, because headless Chrome carries "Chrome" and would
 *     otherwise be filed as a real visitor and inflate every session count
 *   - iPad before macOS, because desktop-mode Safari on an iPad reports
 *     "macintosh"
 */

export interface UserAgentFacts {
  /** 'mobile' | 'tablet' | 'desktop', or null when there was no UA at all. */
  device: string | null;
  browser: string | null;
  os: string | null;
}

export function classifyUserAgent(
  ua: string | null | undefined,
): UserAgentFacts {
  if (!ua) return { device: null, browser: null, os: null };

  const s = ua.toLowerCase();

  const device = /ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s)
    ? 'tablet'
    : /mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(s)
      ? 'mobile'
      : 'desktop';

  const browser = /bot|crawler|spider|headless/.test(s)
    ? 'Bot'
    : /edg\//.test(s)
      ? 'Edge'
      : /opr\/|opera/.test(s)
        ? 'Opera'
        : /samsungbrowser/.test(s)
          ? 'Samsung Internet'
          : /firefox|fxios/.test(s)
            ? 'Firefox'
            : /chrome|crios/.test(s)
              ? 'Chrome'
              // After Chrome: every Chrome UA also says "safari".
              : /safari/.test(s)
                ? 'Safari'
                : 'Other';

  const os = /windows/.test(s)
    ? 'Windows'
    : /iphone|ipad|ipod/.test(s)
      ? 'iOS'
      : /android/.test(s)
        ? 'Android'
        : /mac os x|macintosh/.test(s)
          ? 'macOS'
          : /cros/.test(s)
            ? 'ChromeOS'
            : /linux/.test(s)
              ? 'Linux'
              : 'Other';

  return { device, browser, os };
}

/**
 * The device band a click is bucketed into for the heatmap.
 *
 * Viewport width wins over the UA label when we have it, because the heatmap
 * renders at a fixed device width and the coordinate space has to match what
 * the page was actually laid out in.
 *
 * This must stay byte-identical to the CASE expression in the heatmap query,
 * or the page picker's count and the canvas contradict each other on screen, 
 * the exact failure the source system documents.
 */
export function viewportClass(
  viewportW: number | null,
  device: string | null,
): string | null {
  if (viewportW === null) return device;
  if (viewportW < 600) return 'mobile';
  if (viewportW < 1024) return 'tablet';
  return 'desktop';
}
