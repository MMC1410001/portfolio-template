/**
 * Naming a gesture that is not a DOM click.
 *
 * This is the entire replacement for Lumen's GTM path. There, `analytics()`
 * pushed to `window.dataLayer` and mirrored into the event log; here the name
 * lives in the DOM, so the capture-phase listener already names every real
 * click on the first pass.
 *
 * What is left for this: gestures the click listener cannot name usefully, 
 * a Base UI `Select` changing value (the click landed on a portalled option,
 * not on the trigger), a pause toggle whose meaning is its new state.
 *
 * The enrich-then-fall-back shape matters. If the gesture DID originate from a
 * click, the row is already in the queue and this only adds the value; if it
 * did not, a synthetic row is written. Getting this backwards is how every
 * named tag doubles, which is also why clicks.ts queues `rage_click` before
 * the `click` row and never after.
 */

import { queueEvent, enrichLastEvent } from './queue';
import { normaliseTag } from './normalise';
import { currentSection } from './sections';
import { currentMode } from './mode';

function payloadFor(name: string, props: Record<string, unknown>) {
  return {
    tag: name,
    section: currentSection(),
    mode: currentMode(),
    ...props,
  };
}

export function trackTag(
  tag: string,
  props: Record<string, unknown> = {},
): void {
  const name = normaliseTag(tag);
  if (!name) return;

  const payload = payloadFor(name, props);
  if (enrichLastEvent('click', payload)) return;
  queueEvent('click', {
    props: { selector: name, synthetic: true, ...payload },
  });
}

/**
 * A synthetic row, always, never an enrichment.
 *
 * For a gesture that is known NOT to be a click: the turntable reports from
 * its scroll handler, and trackTag() there would try to name whatever click
 * happened to sit at the tail of the queue. The time window in
 * enrichLastEvent() makes that unlikely; this makes it impossible.
 */
export function trackSyntheticTag(
  tag: string,
  props: Record<string, unknown> = {},
): void {
  const name = normaliseTag(tag);
  if (!name) return;
  queueEvent('click', {
    props: { selector: name, synthetic: true, ...payloadFor(name, props) },
  });
}
