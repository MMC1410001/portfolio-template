'use client';
/**
 * A visitor-facing opt-out, on the privacy page.
 *
 * Writes the same `pfInternal` key that `selfExcluded()` in
 * lib/analytics/scope.ts reads, so `trackingSuppressed()` becomes true and
 * every recording path stops on the spot: no reload, no server round trip,
 * nothing queued.
 *
 * Turning it off also deletes the identifiers that link one visit to the next
 * (the browser id, the tab's session id, the tab's campaign), so turning it
 * back on starts as a browser the site has never seen rather than quietly
 * reconnecting to the visits recorded before. Turning it back on starts a new
 * session with its own `visit` row, as a page load would.
 *
 * A toggle button with `aria-pressed` and a fixed label, because a label that
 * flips with the state tells a screen reader two contradictory things at once.
 * The state itself is spoken from an `<output>`, which is a polite live region
 * by default, so pressing it announces what changed.
 *
 * A disclosure that only describes an opt-out is not much of one. This is the
 * switch, on the page that explains what it turns off.
 */
import { useStored } from '@/hooks/use-stored';
import {
  forgetAnalyticsIdentity,
  restartAnalytics,
  syncAnalyticsRoute,
} from '@/hooks/analytics-route';

export function AnalyticsOptOut() {
  const [flag, setFlag] = useStored('pfInternal', '0');
  const off = flag === '1';

  const toggle = () => {
    const path = window.location.pathname;
    if (off) {
      setFlag('0');
      restartAnalytics(path);
      return;
    }
    setFlag('1');
    forgetAnalyticsIdentity();
    syncAnalyticsRoute(path);
  };

  return (
    <div className="privacy-optout">
      <p>
        <output>
          <strong>
            {off
              ? 'Measurement is off for this browser.'
              : 'Measurement is on for this browser.'}
          </strong>{' '}
          {off
            ? 'Nothing further is recorded, and the identifiers that linked ' +
              'your visits have been deleted from this browser. Anything ' +
              'already collected expires on the schedule above.'
            : 'You can turn it off, for this browser, right here.'}
        </output>
      </p>
      <button type="button" aria-pressed={off} onClick={toggle}>
        Stop measuring my visits
      </button>
      <p className="privacy-note">
        The setting is stored in this browser only. Clearing site data resets
        it, and it does not carry to your other devices. Press the button again
        to turn measurement back on; you would then be counted as a new
        visitor.
      </p>
    </div>
  );
}
