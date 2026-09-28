// ── Uptime and health monitoring ──────────────────────────────────────────
/**
 * Sanitised recreation of the Uptime Kuma instance.
 *
 * The same rules as the rest of the demo data, and one that matters more here
 * than anywhere else: a monitoring dashboard is, by construction, a list of
 * somebody's hostnames next to their outage history. The original's monitor
 * list names the applications and the original's event log carries their
 * failures with timestamps. Neither belongs on a public portfolio — the
 * applications are clients' and the outages are theirs.
 *
 * So the monitors here carry the same positional labels `content/dashboards.ts`
 * uses ("Enterprise client A"), the hostnames are gone entirely rather than
 * masked, and the incident log is representative rather than transcribed. What
 * survives is the part that is actually Alex's: how the thing is set up —
 * parent monitors grouping a frontend and the services behind it, HTTP checks
 * beside TCP ones, a retry count and a shorter recheck interval on a failing
 * monitor, and a Google Chat webhook on state change.
 */
export type UptimeState = 'up' | 'down' | 'paused';

export interface UptimeMonitor {
  id: string;
  /** What it watches, described by role. Never a hostname. */
  name: string;
  /** Positional label, shared with content/dashboards.ts. */
  owner: string;
  kind: 'HTTP' | 'TCP' | 'Keyword' | 'Group';
  /** Group children render indented under their parent, as in the original. */
  parent?: string;
  state: UptimeState;
  uptime30: number;
  responseMs: number | null;
  /** 30 slots, newest last. 1 up, 0 down, null not yet checked. */
  beats: (0 | 1 | null)[];
  intervalSec: number;
  retries: number;
  /** Seconds between rechecks once a monitor is failing. */
  retryIntervalSec: number;
  certDays?: number;
}

const up30 = (): (0 | 1 | null)[] => Array.from({ length: 30 }, () => 1);
const withDip = (at: number[]): (0 | 1 | null)[] =>
  Array.from({ length: 30 }, (_, i) => (at.includes(i) ? 0 : 1));

export const uptimeMonitors: UptimeMonitor[] = [
  { id: 'a-stack', name: 'Customer-facing platform', owner: 'Enterprise client A', kind: 'Group', state: 'up', uptime30: 100, responseMs: null, beats: up30(), intervalSec: 300, retries: 2, retryIntervalSec: 60 },
  { id: 'a-web', name: 'Web frontend', owner: 'Enterprise client A', kind: 'HTTP', parent: 'a-stack', state: 'up', uptime30: 100, responseMs: 89, beats: up30(), intervalSec: 300, retries: 2, retryIntervalSec: 60, certDays: 45 },
  { id: 'a-api', name: 'Application API', owner: 'Enterprise client A', kind: 'Keyword', parent: 'a-stack', state: 'up', uptime30: 99.86, responseMs: 142, beats: withDip([11]), intervalSec: 300, retries: 3, retryIntervalSec: 60 },
  { id: 'a-db', name: 'Database port', owner: 'Enterprise client A', kind: 'TCP', parent: 'a-stack', state: 'up', uptime30: 100, responseMs: 11, beats: up30(), intervalSec: 600, retries: 2, retryIntervalSec: 120 },
  { id: 'b-web', name: 'Public website', owner: 'Enterprise client B', kind: 'HTTP', state: 'up', uptime30: 99.94, responseMs: 210, beats: withDip([4]), intervalSec: 1800, retries: 2, retryIntervalSec: 60, certDays: 118 },
  { id: 'b-admin', name: 'Admin console', owner: 'Enterprise client B', kind: 'HTTP', state: 'up', uptime30: 100, responseMs: 176, beats: up30(), intervalSec: 1800, retries: 2, retryIntervalSec: 60 },
  { id: 'c-web', name: 'Web frontend', owner: 'Enterprise client C', kind: 'HTTP', state: 'down', uptime30: 98.41, responseMs: null, beats: withDip([27, 28, 29]), intervalSec: 300, retries: 3, retryIntervalSec: 30, certDays: 12 },
  { id: 'c-api', name: 'Core service API', owner: 'Enterprise client C', kind: 'Keyword', state: 'up', uptime30: 99.99, responseMs: 96, beats: up30(), intervalSec: 300, retries: 3, retryIntervalSec: 30 },
  { id: 'd-web', name: 'Authenticated portal', owner: 'Enterprise client D', kind: 'HTTP', state: 'up', uptime30: 100, responseMs: 133, beats: up30(), intervalSec: 600, retries: 2, retryIntervalSec: 60, certDays: 203 },
  { id: 'd-worker', name: 'Background worker', owner: 'Enterprise client D', kind: 'TCP', state: 'up', uptime30: 99.72, responseMs: 8, beats: withDip([19]), intervalSec: 600, retries: 2, retryIntervalSec: 60 },
  { id: 'int-erp', name: 'Internal ERP', owner: 'Internal', kind: 'HTTP', state: 'up', uptime30: 99.98, responseMs: 240, beats: up30(), intervalSec: 300, retries: 2, retryIntervalSec: 60 },
  { id: 'int-ci', name: 'Build server', owner: 'Internal', kind: 'TCP', state: 'paused', uptime30: 100, responseMs: null, beats: Array.from({ length: 30 }, () => null), intervalSec: 3600, retries: 1, retryIntervalSec: 300 },
];

/** Representative, not transcribed. See the note above. */
export const uptimeEvents = [
  { at: '2026-09-21 14:12', monitor: 'Web frontend', owner: 'Enterprise client C', state: 'down' as const, message: 'Request failed with status code 502' },
  { at: '2026-09-21 09:40', monitor: 'Background worker', owner: 'Enterprise client D', state: 'up' as const, message: 'Recovered after 1 retry' },
  { at: '2026-09-21 09:38', monitor: 'Background worker', owner: 'Enterprise client D', state: 'down' as const, message: 'Connection refused on service port' },
  { at: '2026-09-20 11:02', monitor: 'Application API', owner: 'Enterprise client A', state: 'up' as const, message: '200 — keyword matched' },
  { at: '2026-09-20 10:56', monitor: 'Application API', owner: 'Enterprise client A', state: 'down' as const, message: 'Keyword not found in response body' },
  { at: '2026-09-19 14:05', monitor: 'Public website', owner: 'Enterprise client B', state: 'up' as const, message: '200 — OK' },
];

/** The response-time trace on the detail panel, newest last. */
export const uptimeTrace = [
  88, 86, 91, 84, 87, 312, 89, 85, 88, 90, 83, 86, 88, 92, 87, 85, 89, 306, 91,
  84, 86, 88, 87, 90, 85, 88, 86, 93, 96, 101, 98, 94, 89, 87, 88, 90,
];

export const uptimeMeta = {
  /** How a failure reaches a person, which is the part worth showing. */
  notifier: 'Google Chat incoming webhook',
  /** Quoted once; everything else on the card is derived from the monitors. */
  monitorsTotal: 44,
  checkedAt: '21 Sep 2026, 15:20 IST',
} as const;
