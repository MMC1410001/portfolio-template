'use client';

/**
 * Trusted networks: the owner's own connections, edited here.
 *
 * One list, two effects (lib/analytics/trusted.ts): a session from one of
 * these networks is recorded as internal, and a chat question from one is
 * held to no limit. Rows added here can be removed here; rows from the
 * Worker's env (ANALYTICS_INTERNAL_CIDRS, CHAT_UNLIMITED_CIDRS) are shown so
 * the list on screen is the whole list, but only the env can remove them.
 *
 * Admin-only: the public /analytics showcase has no database and never
 * renders this (see `adminOnly` in admin-sections.ts).
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdminError, fetchAdmin } from '@/lib/admin-client';
import { istDateTime } from './analytics-format';
import { PanelError } from './AdminSection';

interface Entry {
  cidr: string;
  label: string;
  addedAt: number | null;
  addedBy: string;
  source: 'panel' | 'env';
  /** This entry's range contains the address this request came from. */
  coversYou: boolean;
}
interface Listing {
  entries: Entry[];
  yourIp: string | null;
  /** What "Add my current IP" adds: the address for IPv4, its /64 for IPv6. */
  yourNetwork: string | null;
  yourIpCovered: boolean;
}

const REFUSALS: Record<string, string> = {
  invalid: 'That is not an address or range this list accepts. Use an IP (203.0.113.7) or a range no wider than /24 for IPv4 or /48 for IPv6.',
  full: 'The list is full. Remove a network you no longer use first.',
  env: 'That one comes from the Worker settings and can only be removed there.',
  missing: 'That network is not on the list.',
};

const reason = (error: unknown) =>
  error instanceof AdminError ? (REFUSALS[error.message] ?? error.message) : 'Could not reach the server. Try again.';

export function TrustedNetworksPanel() {
  const [listing, setListing] = useState<Listing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cidr, setCidr] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    fetchAdmin<Listing>('trusted-list', {}, abort.signal).then(
      (data) => { if (!abort.signal.aborted) setListing(data); },
      (error: unknown) => { if (!abort.signal.aborted) setLoadError(reason(error)); },
    );
    return () => abort.abort();
  }, []);

  async function change(action: 'trusted-add' | 'trusted-remove', target: string, withLabel = '') {
    setBusy(true);
    setFailed(null);
    try {
      setListing(await fetchAdmin<Listing>(action, { cidr: target, label: withLabel }));
      if (action === 'trusted-add') {
        setCidr('');
        setLabel('');
      }
    } catch (error) {
      setFailed(reason(error));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <PanelError message={loadError} />;
  if (!listing) return <p className="text-xs text-muted-foreground">Loading…</p>;

  const { yourIp, yourNetwork, yourIpCovered } = listing;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Visits from these networks are counted as internal, so &ldquo;Real visitors&rdquo; leaves them out, and the chat
        guide applies no question limit to them. Everyone behind a listed address is covered. Changes reach every request
        within 30 seconds; visits already recorded keep the label they were given.
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/50 text-[11px] text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Network</th>
              <th scope="col" className="px-3 py-2 font-medium">Label</th>
              <th scope="col" className="px-3 py-2 font-medium">Source</th>
              <th scope="col" className="px-3 py-2 font-medium">Added</th>
              <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {listing.entries.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-4 text-muted-foreground">No trusted networks yet.</td></tr>
            ) : listing.entries.map((entry) => (
              <tr key={entry.cidr} className="border-t">
                <td className="px-3 py-2 font-mono">
                  {entry.cidr}
                  {entry.coversYou ? <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 font-sans text-[10px] text-primary">you</span> : null}
                </td>
                <td className="px-3 py-2">{entry.label || <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-muted-foreground">{entry.source === 'env' ? 'Worker setting' : 'This panel'}</td>
                <td className="px-3 py-2 text-muted-foreground">{entry.addedAt ? istDateTime(entry.addedAt) : '—'}</td>
                <td className="px-3 py-2 text-right">
                  {entry.source === 'panel' ? (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void change('trusted-remove', entry.cidr)} aria-label={`Remove ${entry.cidr}`}>
                      Remove
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {yourIp && yourNetwork && !yourIpCovered ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => void change('trusted-add', yourNetwork, 'Added from this browser')}>
            Add my current IP
          </Button>
          <span className="font-mono text-[11px] text-muted-foreground">{yourNetwork}</span>
          {yourNetwork.includes(':') ? <span className="text-[11px] text-muted-foreground">(the /64 your IPv6 address {yourIp} rotates within)</span> : null}
        </div>
      ) : yourIp && yourIpCovered ? (
        <p className="text-[11px] text-muted-foreground">Your current IP, <span className="font-mono">{yourIp}</span>, is covered by the list.</p>
      ) : null}

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void change('trusted-add', cidr, label);
        }}
      >
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="trusted-cidr" className="text-[11px] text-muted-foreground">IP address or range</label>
          <Input id="trusted-cidr" value={cidr} onChange={(e) => setCidr(e.target.value)} placeholder="203.0.113.7 or 203.0.113.0/24" autoComplete="off" spellCheck={false} />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="trusted-label" className="text-[11px] text-muted-foreground">Label (optional)</label>
          <Input id="trusted-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Home, office, phone…" maxLength={60} autoComplete="off" />
        </div>
        <Button type="submit" size="sm" disabled={busy || !cidr.trim()}>Add network</Button>
      </form>
      {failed ? <p role="alert" className="text-xs text-destructive">{failed}</p> : null}
    </div>
  );
}
