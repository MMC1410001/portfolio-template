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

export function trackTag(
  tag: string,
  props: Record<string, unknown> = {},
): void {
  const name = normaliseTag(tag);
  if (!name) return;

  const payload = {
    tag: name,
    section: currentSection(),
    mode: currentMode(),
    ...props,
  };

  if (enrichLastEvent('click', payload)) return;
  queueEvent('click', {
    props: { selector: name, synthetic: true, ...payload },
  });
}
