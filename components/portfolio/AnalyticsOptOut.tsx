'use client';
/**
 * A visitor-facing opt-out, on the privacy page.
 *
 * Writes the same `pfInternal` key that `selfExcluded()` in
 * lib/analytics/scope.ts reads, so `trackingSuppressed()` becomes true and
 * every recording path stops on the spot: no reload, no server round trip,
 * nothing queued.
 *
 * A disclosure that only describes an opt-out is not much of one. This is the
 * switch, on the page that explains what it turns off.
 */
import { useStored } from '@/hooks/use-stored';

export function AnalyticsOptOut() {
  const [flag, setFlag] = useStored('pfInternal', '0');
  const off = flag === '1';

  return (
    <div className="privacy-optout">
      <p>
        <strong>
          {off
            ? 'Measurement is off for this browser.'
            : 'Measurement is on for this browser.'}
        </strong>{' '}
        {off
          ? 'Nothing further is recorded. Anything already collected expires ' +
            'on the schedule above.'
          : 'You can turn it off, for this browser, right here.'}
      </p>
      <button type="button" onClick={() => setFlag(off ? '0' : '1')}>
        {off ? 'Turn measurement back on' : 'Stop measuring my visits'}
      </button>
      <p className="privacy-note">
        The setting is stored in this browser only. Clearing site data resets
        it, and it does not carry to your other devices.
      </p>
    </div>
  );
}
