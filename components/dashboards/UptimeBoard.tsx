'use client';
/**
 * Recreation of the Uptime Kuma instance.
 *
 * ── What a monitoring dashboard is, and why that constrains this one ──────
 * Every other board in this folder shows work about an application. This one
 * shows a list of applications next to their outage history, which is a
 * different kind of disclosure: the hostnames are clients' and the downtime
 * is theirs. The original names both. So the monitors here carry the same
 * positional labels `content/dashboards.ts` uses, the hostnames are absent
 * rather than masked, and the event log is representative rather than
 * transcribed. See the note above `uptimeMonitors`.
 *
 * What survives is the part that is Alex's: the shape of the setup. Parent
 * monitors grouping a frontend with the services behind it, HTTP checks
 * beside keyword and TCP ones, a retry count and a shorter recheck interval
 * once a monitor is failing, and a Google Chat webhook on state change.
 *
 * ── Why the retry interval is on the card rather than in a footnote ───────
 * It is the setting that decides whether the alerts get read. A monitor that
 * pages on the first failed request pages on every slow response, and a team
 * that gets paged for nothing stops looking. Check interval, retries and
 * retry interval are shown per monitor because choosing them is the work.
 */
import { useState } from 'react';
import {
  uptimeEvents,
  uptimeMeta,
  uptimeMonitors,
  uptimeTrace,
  type UptimeMonitor,
} from '@/content/dashboards-demo';
import { DarkFrame, DarkHeader, DarkLivePill, DarkPanel, DarkStat, DashNote } from './shell';

const UP = '#5cdd8b';
const DOWN = '#ef4444';
const IDLE = '#39405a';

function beatColor(beat: 0 | 1 | null): string {
  if (beat === null) return IDLE;
  return beat === 1 ? UP : DOWN;
}

/** The heartbeat bar: one slot per check, oldest left. */
function Heartbeat({ beats }: { beats: (0 | 1 | null)[] }) {
  return (
    <span className="flex items-center gap-[2px]" aria-hidden>
      {beats.map((beat, i) => (
        <span
          key={i}
          className="block h-4 w-[3px] rounded-[1px] sm:w-1"
          style={{ background: beatColor(beat) }}
        />
      ))}
    </span>
  );
}

function StatePill({ state }: { state: UptimeMonitor['state'] }) {
  const style =
    state === 'up'
      ? 'bg-emerald-500/15 text-emerald-400'
      : state === 'down'
        ? 'bg-red-500/15 text-red-400'
        : 'bg-[#252a3a] text-[#8a93ad]';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${style}`}>
      {state}
    </span>
  );
}

function every(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

/** Response-time trace. Plain SVG, same approach as the other boards. */
function Trace({ points }: { points: number[] }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = Math.max(1, max - min);
  const path = points
    .map((value, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 100 - ((value - min) / span) * 88 - 6;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  // The shape is decorative: the numbers a reader needs are in the fields
  // above it, and the range is given in text below. Matches charts.tsx,
  // where the SVGs are hidden and the data is stated beside them.
  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-28 w-full" aria-hidden>
        <path d={`${path} L100,100 L0,100 Z`} fill="rgba(92,221,139,.14)" />
        <path d={path} fill="none" stroke={UP} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-2 text-[11px] text-[#6d7590] tabular-nums">
        {min}–{max} ms across the last {points.length} checks, two spikes on scheduled jobs.
      </p>
    </>
  );
}

export function UptimeBoard() {
  const parents = uptimeMonitors.filter((m) => !m.parent);
  const [selectedId, setSelectedId] = useState('a-web');
  const selected = uptimeMonitors.find((m) => m.id === selectedId) ?? uptimeMonitors[0];

  const checked = uptimeMonitors.filter((m) => m.state !== 'paused');
  const down = uptimeMonitors.filter((m) => m.state === 'down').length;
  const paused = uptimeMonitors.filter((m) => m.state === 'paused').length;
  const avgUptime = checked.reduce((sum, m) => sum + m.uptime30, 0) / checked.length;

  return (
    <DarkFrame>
      <DarkHeader
        mark="UK"
        title="Uptime and health monitoring"
        subtitle="Uptime Kuma across the applications he works on: frontends, APIs and the services behind them, grouped per application, alerting into Google Chat."
        badge={<DarkLivePill time={uptimeMeta.checkedAt} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <DarkStat label="Up" value={String(uptimeMonitors.length - down - paused)} tone="green" />
        <DarkStat label="Down" value={String(down)} tone={down ? 'red' : 'green'} />
        <DarkStat label="Paused" value={String(paused)} tone="indigo" />
        <DarkStat label="Avg uptime" value={avgUptime.toFixed(2)} unit="% · 30d" tone="blue" />
        <DarkStat label="Monitors" value={String(uptimeMeta.monitorsTotal)} tone="violet" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <DarkPanel eyebrow="Monitors" title="Grouped per application">
          <ul className="space-y-1">
            {parents.map((parent) => {
              const children = uptimeMonitors.filter((m) => m.parent === parent.id);
              return (
                <li key={parent.id}>
                  <MonitorRow monitor={parent} selected={selectedId === parent.id} onSelect={setSelectedId} />
                  {children.length ? (
                    <ul className="mt-1 space-y-1 border-l border-[#252a3a] pl-3">
                      {children.map((child) => (
                        <li key={child.id}>
                          <MonitorRow monitor={child} selected={selectedId === child.id} onSelect={setSelectedId} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[11px] text-[#6d7590]">
            Application names are positional labels, the same ones used across these dashboards. Hostnames are not published.
          </p>
        </DarkPanel>

        <div className="space-y-4">
          <DarkPanel
            eyebrow="Selected"
            title={selected.name}
            right={<StatePill state={selected.state} />}
          >
            <Heartbeat beats={selected.beats} />
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <Field label="Owner" value={selected.owner} />
              <Field label="Type" value={selected.kind} />
              <Field label="Response" value={selected.responseMs === null ? '—' : `${selected.responseMs} ms`} />
              <Field label="Uptime, 30d" value={`${selected.uptime30}%`} />
              <Field label="Check every" value={every(selected.intervalSec)} />
              <Field label="Cert expiry" value={selected.certDays ? `${selected.certDays} days` : '—'} />
            </dl>
            {/* The settings that decide whether anyone still reads the alerts. */}
            <div className="mt-4 rounded-xl border border-[#252a3a] bg-[#11151f] p-3">
              <p className="text-[11px] font-semibold tracking-[.08em] text-indigo-400 uppercase">
                On failure
              </p>
              <p className="mt-1.5 text-sm text-[#c2c9db]">
                Retry <strong className="text-white">{selected.retries}×</strong>, rechecking every{' '}
                <strong className="text-white">{every(selected.retryIntervalSec)}</strong> while it is failing, then
                notify <strong className="text-white">{uptimeMeta.notifier}</strong> on the state change.
              </p>
              <p className="mt-1.5 text-[11px] text-[#6d7590]">
                Alerting on the first failed request means alerting on every slow response, and a team paged for
                nothing stops reading the alerts. Choosing these three numbers per monitor is the work.
              </p>
            </div>
          </DarkPanel>

          <DarkPanel eyebrow="Response time" title="Recent checks">
            <Trace points={uptimeTrace} />
          </DarkPanel>
        </div>
      </div>

      <DarkPanel eyebrow="Events" title="State changes" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] tracking-[.08em] text-[#6d7590] uppercase">
                <th scope="col" className="pb-2 font-semibold">When</th>
                <th scope="col" className="pb-2 font-semibold">Monitor</th>
                <th scope="col" className="pb-2 font-semibold">State</th>
                <th scope="col" className="pb-2 font-semibold">Message</th>
              </tr>
            </thead>
            <tbody>
              {uptimeEvents.map((event) => (
                <tr key={`${event.at}-${event.monitor}`} className="border-t border-[#222839]">
                  <td className="py-2 pr-3 whitespace-nowrap text-[#8a93ad] tabular-nums">{event.at}</td>
                  <td className="py-2 pr-3 text-[#e6e9f2]">
                    {event.monitor}
                    <span className="block text-[11px] text-[#6d7590]">{event.owner}</span>
                  </td>
                  <td className="py-2 pr-3"><StatePill state={event.state} /></td>
                  <td className="py-2 text-[#c2c9db]">{event.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DarkPanel>

      <DashNote>
        Recreated from the original with the identifying parts removed rather than masked: no hostnames, positional
        labels for the applications, and an event log that is representative rather than transcribed. A monitoring
        board is a list of somebody else&rsquo;s systems next to their downtime, and that is theirs to publish, not
        mine. The configuration shown — grouping, check types, retries and the recheck interval — is the part that
        is mine.
      </DashNote>
    </DarkFrame>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] tracking-[.06em] text-[#6d7590] uppercase">{label}</dt>
      <dd className="mt-0.5 font-medium text-[#e6e9f2]">{value}</dd>
    </div>
  );
}

function MonitorRow({
  monitor,
  selected,
  onSelect,
}: {
  monitor: UptimeMonitor;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(monitor.id)}
      aria-pressed={selected}
      data-track-tag="dashboard-uptime-monitor"
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
        selected
          ? 'border-indigo-500/60 bg-[#1b2030]'
          : 'border-transparent bg-[#11151f] hover:border-[#2b3247]'
      }`}
    >
      <span
        className="w-14 shrink-0 rounded-full py-0.5 text-center text-[10px] font-bold tabular-nums"
        style={{
          background: monitor.state === 'down' ? 'rgba(239,68,68,.15)' : 'rgba(92,221,139,.15)',
          color: monitor.state === 'down' ? DOWN : UP,
        }}
      >
        {monitor.uptime30}%
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-[#e6e9f2]">{monitor.name}</span>
        <span className="block truncate text-[11px] text-[#6d7590]">
          {monitor.owner} · {monitor.kind} · every {every(monitor.intervalSec)}
        </span>
      </span>
      <Heartbeat beats={monitor.beats.slice(-18)} />
    </button>
  );
}
