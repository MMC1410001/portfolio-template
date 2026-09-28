/**
 * Delegated click capture, "which elements do people actually click?"
 *
 * One listener on the document rather than an onClick on every element,
 * because the alternative is editing every call site and then remembering to
 * edit every new one.
 *
 * It runs in the **capture** phase on purpose. A handler that calls
 * stopPropagation() would stop a bubble-phase listener from ever seeing the
 * click; capture always sees it first.
 *
 * ── Why the source system's enrich machinery mostly disappears ─────────────
 * Lumen could not name a click in the capture phase: the name lived in
 * `window.dataLayer`, pushed later from inside React's handler. Hence
 * record-then-enrich. There is no GTM here, the name is in the DOM as
 * `data-track-tag`, so describeElement() reads it on the first pass and the row
 * is named immediately. No dataLayer, no second writer, no double counting.
 *
 * ── The queue-order rule survives anyway ──────────────────────────────────
 * enrichLastEvent() names the event at the TAIL of the queue and refuses if it
 * is not a `click`. So the `click` row must be the last thing this handler
 * queues, and the rage_click for the same gesture goes FIRST. Reverse them and
 * any trackTag() call in a React handler for that gesture writes a second,
 * synthetic row.
 */

import type { ClickPoint } from './events';
import { queueEvent } from './queue';
import { isUntrackedPath } from './scope';
import { normalisePoint, normaliseText, normaliseTag } from './normalise';
import { currentSection } from './sections';
import { currentMode } from './mode';

/**
 * Coordinate sampling, 1.0, where the source system used 0.25.
 *
 * Lumen sampled because click_points was its highest-volume table across 21
 * pages. A portfolio sees tens of clicks a day; a quarter of that never
 * converges into a readable heatmap. Same reasoning for dead clicks (0.15
 * there).
 */
const COORD_SAMPLE_RATE = 1;
const DEAD_SAMPLE_RATE = 1;

/**
 * Per-view caps, rescoped.
 *
 * "Per view" meant per route change in the source system. Here one view is the
 * whole session, so Lumen's 8 and 3 would be far tighter in practice than
 * they were there. Raised to keep the same effective generosity.
 */
const DEAD_MAX_PER_VIEW = 20;
const RAGE_MAX_PER_VIEW = 6;

/** Human-gesture constants, not volume constants. Unchanged. */
const RAGE_MIN_CLICKS = 3;
const RAGE_WINDOW_MS = 700;
const RAGE_RADIUS_PX = 40;

/**
 * What earns a `click` row.
 *
 * `details, summary` are additions: both appear on this page (the ERP case
 * study and each recommendation) and expanding one is among the best
 * engagement signals the site has.
 */
const INTERACTIVE =
  "a, button, [role='button'], input, select, textarea, label, summary," +
  ' details, [data-track-tag]';

/**
 * Regions whose text belongs to the visitor, not to the page.
 *
 * The chat transcript is the one that exists today: a question is typed by the
 * visitor, and an email address or a phone number in it would otherwise reach
 * `props.selector` through textContent and sit in the event log for 180 days,
 * outside the 30-day question-text policy and past normaliseQuestion()'s PII
 * refusal entirely. Anything inside one is named by its markup, never its text.
 */
const PRIVATE_REGION = '[data-track-private]';

function isPrivate(el: Element): boolean {
  return typeof el.closest === 'function' && el.closest(PRIVATE_REGION) !== null;
}

/**
 * Tag, then id or first class, and nothing a visitor could have typed.
 *
 * For elements that are not controls. A dead click lands on whatever div was
 * under the pointer, and the nearest div with text is very often a chat
 * bubble, so this reads none of textContent, aria-label or title: only
 * author-written markup is safe to name.
 */
export function describeStructure(el: Element): string {
  const tagName = el.tagName.toLowerCase();
  if (el.id) return `${tagName}#${el.id}`.slice(0, 60);
  // getAttribute, not className: on an SVG node className is an object.
  const first = (el.getAttribute('class') ?? '').trim().split(/\s+/)[0];
  return first ? `${tagName}.${first}`.slice(0, 60) : tagName;
}

/**
 * A human-readable, reasonably stable identifier for a control.
 *
 * Deliberately not a CSS path: Tailwind class lists are long, unstable and
 * meaningless in a table, and an nth-child path breaks the moment anything is
 * inserted above it. Tag plus accessible name survives both and is legible in
 * the dashboard without a lookup.
 *
 * Inside a PRIVATE_REGION the textContent step is skipped, for the name and for
 * `text`: a link in a chat answer is still named by its attributes, never by
 * words the visitor may have supplied.
 */
export function describeElement(el: Element): {
  selector: string;
  text: string | null;
  tag: string | null;
} {
  const tagName = el.tagName.toLowerCase();
  const own = isPrivate(el) ? null : el.textContent;
  const explicit = normaliseTag(el.getAttribute('data-track-tag'));
  if (explicit) {
    return { selector: explicit, text: normaliseText(own), tag: explicit };
  }

  const name =
    normaliseText(el.getAttribute('aria-label')) ??
    normaliseText(el.getAttribute('alt')) ??
    normaliseText(el.getAttribute('title')) ??
    normaliseText(own, 40) ??
    normaliseText(el.getAttribute('name')) ??
    (el.id ? `#${el.id}` : null);

  return {
    selector: name ? `${tagName}:${name}` : tagName,
    text: normaliseText(own),
    tag: null,
  };
}

/**
 * Build the coordinate for a click.
 *
 * Shared by the real and the dead path so the two cannot disagree about what a
 * position means, a dead-click map drawn in a different coordinate space to
 * the click map would be worse than not having one.
 */
function pointFor(event: MouseEvent, selector: string | null): ClickPoint {
  const doc = document.documentElement;

  /**
   * Width: the LAYOUT viewport, not scrollWidth.
   *
   * The heatmap multiplies x back out by a fixed device width (390/834/1440).
   * Dividing by scrollWidth here meant that on any page with horizontal
   * overflow every x was compressed against a larger number than the renderer
   * expands by, and the whole map drifted left. clientWidth is the box CSS
   * actually laid the page out in, so the two agree.
   */
  const docWidth = doc.clientWidth || window.innerWidth || 1;
  /** Height: the full scroll height, which is what y is a fraction of. */
  const docHeight = Math.max(doc.scrollHeight, window.innerHeight, 1);

  const { x_pct, y_pct } = normalisePoint(
    event.pageX,
    event.pageY,
    docWidth,
    docHeight,
  );

  // doc_h travels with the point so the panel can place it by absolute depth.
  // Far more load-bearing here than in the source system: one `<details>`
  // opening changes this page's scrollHeight by thousands of pixels, so two
  // clicks in one session can be fractions of two different heights.
  return { x_pct, y_pct, selector, doc_h: Math.round(docHeight) };
}

// ── Per-view state ──────────────────────────────────────────────────────────
// Module memory, not sessionStorage: nothing here is worth a storage key that
// would then have to be cleared by hand.
let deadThisView = 0;
let rageThisView = 0;
let recent: { t: number; x: number; y: number }[] = [];

export function resetPageInteractions(): void {
  deadThisView = 0;
  rageThisView = 0;
  recent = [];
}

/**
 * Is this click the tail of a burst in one spot?
 *
 * Clears the buffer when it fires, so a fourth and fifth click do not each
 * report their own burst, one gesture, one row.
 */
function isRageBurst(event: MouseEvent): boolean {
  const now = Date.now();
  recent = recent.filter((c) => now - c.t < RAGE_WINDOW_MS);

  const near = recent.filter(
    (c) => Math.hypot(c.x - event.pageX, c.y - event.pageY) <= RAGE_RADIUS_PX,
  ).length;

  recent.push({ t: now, x: event.pageX, y: event.pageY });
  // Cap the buffer: a long press-and-hold on a touch device emits a lot.
  if (recent.length > 12) recent = recent.slice(-12);

  if (near < RAGE_MIN_CLICKS - 1) return false;
  recent = [];
  return true;
}

let handler: ((event: Event) => void) | null = null;

/** Install the listener. Idempotent, a remount must not double-count. */
export function installClickTracking(): void {
  if (handler || typeof document === 'undefined') return;

  handler = (raw: Event) => {
    try {
      const event = raw as MouseEvent;
      if (isUntrackedPath(window.location.pathname)) return;

      const target = event.target as Element | null;
      if (!target || typeof target.closest !== 'function') return;

      const section = currentSection();
      const mode = currentMode();
      const el = target.closest(INTERACTIVE);
      // What a click on nothing interactive is filed under: the nearest thing
      // that can be named, so the row says *what* was clicked and not only
      // where. By structure only, see describeStructure(). This used to be
      // describeElement(near), the first 40 characters of the nearest div,
      // and a chat bubble is a div.
      const near = el ? null : target.closest('[id], [class], section, article, div');
      const structural = near ? describeStructure(near) : target.tagName.toLowerCase();

      // Queued BEFORE the click row below, never after. See the queue-order
      // rule in the header.
      if (rageThisView < RAGE_MAX_PER_VIEW && isRageBurst(event)) {
        rageThisView += 1;
        const rageSelector = el ? describeElement(el).selector : structural;
        queueEvent('rage_click', {
          props: { selector: rageSelector, dead: !el, section, mode },
          point: pointFor(event, rageSelector),
        });
      }

      if (!el) {
        /**
         * A click that hit nothing interactive.
         *
         * Without this the heatmap is ambiguous in the one way that matters: a
         * cold region could mean nobody clicked there, or it could mean people
         * click there constantly and nothing happens. Only the second is a bug,
         * and it was invisible.
         */
        if (deadThisView < DEAD_MAX_PER_VIEW && Math.random() < DEAD_SAMPLE_RATE) {
          deadThisView += 1;
          queueEvent('dead_click', {
            props: {
              selector: structural,
              tag: null,
              section,
              mode,
            },
            point: pointFor(event, null),
          });
        }
        return;
      }

      const { selector, text, tag } = describeElement(el);
      const point =
        Math.random() < COORD_SAMPLE_RATE ? pointFor(event, selector) : undefined;

      queueEvent('click', {
        props: { selector, text, tag, sampled: Boolean(point), section, mode },
        point,
      });
    } catch {
      /* never let instrumentation break a click the visitor meant to make */
    }
  };

  // capture: true. See the header comment. This is load-bearing.
  document.addEventListener('click', handler, true);
}

/**
 * Test seam. Not for application code.
 *
 * Detaches rather than only clearing the flag: leaving the old listener bound
 * while allowing a reinstall stacks one listener per reset, and every click
 * then counts once per stacked listener.
 */
export function __resetClickTracking(): void {
  if (handler && typeof document !== 'undefined') {
    document.removeEventListener('click', handler, true);
  }
  handler = null;
  resetPageInteractions();
}
