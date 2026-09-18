'use client';
/**
 * Recreation of the effort utilisation and approval report.
 *
 * ── Five sections because the question has five answers ───────────────────
 * "How many hours" is trivial. The question this was built for is "how many
 * hours have been *approved*, and has the invoice for them been paid", which
 * decomposes into a total, a monthly curve, a per-project approval split, a
 * per-person load, and a purchase-order state, and the client asked about a
 * different one of those each month. The rail is real navigation here for the
 * same reason it is in the original: a single scroll of all five buries
 * whichever one is being asked about today.
 *
 * ── Approved, rejected and pending are a status palette ───────────────────
 * Green/red/amber keep the meanings the original gave them rather than being
 * reassigned by a categorical order. Red beside green is the pair a
 * colour-blind reader cannot separate, so every stacked segment prints its
 * own hours, the legend carries the numbers, and the table below repeats all
 * three columns. See the note at the top of `charts.tsx`.
 *
 * ── Totals are summed, not typed ──────────────────────────────────────────
 * The header total, the approval split, the monthly average and every
 * percentage are computed from `effortProjects` and `effortMonths`. The
 * originals had a standing bug class exactly here: a summary cell that was
 * last updated by hand and no longer agreed with the rows beneath it.
 */
import { useMemo, useState } from 'react';
import {
  effortKickoff,
  effortMonths,
  effortPo,
  effortProjects,
  effortResources,
} from '@/content/dashboards-demo';
import { APPROVAL_COLOR, Columns, Donut, Legend, share, StackedBar } from './charts';
import {
  DarkPanel,
  DarkPill,
  DarkStat,
  DarkTh,
  DashNote,
  RailShell,
  type RailItem,
} from './shell';

const SECTIONS: RailItem[] = [
  { id: 'summary', label: 'Overall summary' },
  { id: 'months', label: 'Month-wise efforts' },
  { id: 'projects', label: 'Project-wise efforts' },
  { id: 'resources', label: 'Resource-wise grid' },
  { id: 'po', label: 'PO & payment' },
];

const PAYMENT_COLOR = {
  'Payment received': '#22c55e',
  'Invoice sent': '#3b82f6',
  Pending: '#eab308',
} as const;

function SectionHead({ n, title }: { n: number; title: string }) {
  return (
    <header className="mb-4">
      <p className="text-[11px] font-semibold tracking-[.1em] text-indigo-400 uppercase">
        Section {n}
      </p>
      <h4 className="text-lg font-bold tracking-tight text-white uppercase">
        {title}
      </h4>
    </header>
  );
}

export function EffortApprovalBoard() {
  const [section, setSection] = useState('summary');

  const totals = useMemo(() => {
    const t = { total: 0, approved: 0, rejected: 0, pending: 0 };
    for (const p of effortProjects) {
      t.total += p.total;
      t.approved += p.approved;
      t.rejected += p.rejected;
      t.pending += p.pending;
    }
    return t;
  }, []);

  const monthTotal = effortMonths.reduce((n, m) => n + m.hours, 0);
  const peak = Math.max(...effortMonths.map((m) => m.hours));
  const avg = monthTotal / effortMonths.length;

  const resourceTotals = useMemo(
    () =>
      effortResources.map((r) => ({
        ...r,
        total: r.byMonth.reduce<number>((n, h) => n + (h ?? 0), 0),
      })),
    [],
  );
  const resourceMax = Math.max(
    ...resourceTotals.flatMap((r) => r.byMonth.map((h) => h ?? 0)),
  );
  const top = [...resourceTotals].sort((a, b) => b.total - a.total)[0];

  const split = [
    { label: 'Approved', value: totals.approved, color: APPROVAL_COLOR.approved },
    { label: 'Rejected', value: totals.rejected, color: APPROVAL_COLOR.rejected },
    { label: 'Pending', value: totals.pending, color: APPROVAL_COLOR.pending },
  ];

  return (
    <>
      <RailShell
        tone="dark"
        brand={
          <>
            <p className="text-sm font-bold text-white">Client effort report</p>
            <p className="text-[11px] font-semibold tracking-[.1em] text-[#6e778f] uppercase">
              Effort utilisation
            </p>
          </>
        }
        items={SECTIONS}
        active={section}
        onSelect={setSection}
        footer={
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-400" />
            Live · 10:02:08
          </span>
        }
      >
        <header className="mb-5">
          <h3 className="text-2xl font-bold tracking-tight text-white">
            Effort utilisation and approval
          </h3>
          <p className="mt-1 text-sm text-[#8a93ad]">
            Tracking from {effortKickoff} · {effortMonths.length} months · {totals.total} total hrs across {effortProjects.length} projects
          </p>
        </header>

        {section === 'summary' ? (
          <>
            <DarkPanel className="mb-5">
              <SectionHead n={1} title="Overall efforts summary" />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
                <DarkStat label="Total projects" value={effortProjects.length} tone="blue" />
                <DarkStat label="Total efforts executed" value={totals.total} unit="hrs" tone="violet" />
                <DarkStat label="Approved efforts" value={totals.approved} unit="hrs" tone="green" />
                <DarkStat label="Rejected efforts" value={totals.rejected} unit="hrs" tone="red" />
                <DarkStat label="Pending approval" value={totals.pending} unit="hrs" tone="amber" />
                <DarkStat label="Months covered" value={effortMonths.length} unit="mo" tone="blue" />
                <DarkStat label="Kick-start date" value={effortKickoff} tone="violet" />
              </div>
            </DarkPanel>
            <DarkPanel title="Approval status breakdown">
              <div className="flex flex-col items-center gap-6 sm:flex-row">
                <Donut
                  dark
                  segments={split}
                  center={{ value: totals.total, label: 'Total hours' }}
                />
                <Legend dark segments={split} total={totals.total} />
              </div>
            </DarkPanel>
          </>
        ) : null}

        {section === 'months' ? (
          <>
            <DarkPanel className="mb-5">
              <SectionHead n={2} title="Month-wise efforts summary" />
              <Columns dark data={effortMonths.map((m) => ({ label: m.month, value: m.hours }))} />
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <DarkStat label="Total hours" value={monthTotal} unit="hrs" tone="violet" />
                <DarkStat label="Peak month" value={peak} unit="hrs" tone="green" />
                <DarkStat label="Avg / month" value={avg.toFixed(1)} unit="hrs" tone="blue" />
              </div>
            </DarkPanel>
            <DarkPanel title="Monthly breakdown table">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#252a3a]">
                    <DarkTh label="Month" />
                    <DarkTh label="Total hours" className="text-right!" />
                    <DarkTh label="Share" className="text-right!" />
                  </tr>
                </thead>
                <tbody>
                  {effortMonths.map((m) => (
                    <tr key={m.month} className="border-b border-[#1d2230]">
                      <td className="px-3 py-3 text-sm text-[#c2c9db]">{m.month}</td>
                      <td className="px-3 py-3 text-right text-sm font-semibold text-white tabular-nums">{m.hours}</td>
                      <td className="px-3 py-3 text-right text-sm text-[#8a93ad] tabular-nums">{share(m.hours, monthTotal)}</td>
                    </tr>
                  ))}
                  <tr className="bg-[#1a2030]">
                    <td className="px-3 py-3 text-sm font-bold text-white">Total</td>
                    <td className="px-3 py-3 text-right text-sm font-bold text-white tabular-nums">{monthTotal}</td>
                    <td className="px-3 py-3 text-right text-sm font-bold text-white tabular-nums">100%</td>
                  </tr>
                </tbody>
              </table>
            </DarkPanel>
          </>
        ) : null}

        {section === 'projects' ? (
          <DarkPanel>
            <SectionHead n={3} title="Project-wise efforts summary" />
            <ul className="space-y-4">
              {effortProjects.map((p) => (
                <li key={p.name}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-white">{p.name}</span>
                    <span className="shrink-0 text-xs text-[#8a93ad] tabular-nums">{p.total} hrs</span>
                  </div>
                  <StackedBar
                    dark
                    segments={[
                      { label: 'Approved', value: p.approved, color: APPROVAL_COLOR.approved },
                      { label: 'Rejected', value: p.rejected, color: APPROVAL_COLOR.rejected },
                      { label: 'Pending', value: p.pending, color: APPROVAL_COLOR.pending },
                    ]}
                  />
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Legend dark inline segments={split} total={totals.total} />
            </div>
            <div className="-mx-2 mt-5 overflow-x-auto">
              <table className="w-full min-w-150 border-collapse">
                <thead>
                  <tr className="border-b border-[#252a3a]">
                    <DarkTh label="Project" />
                    <DarkTh label="Total" className="text-right!" />
                    <DarkTh label="Approved" className="text-right!" />
                    <DarkTh label="Rejected" className="text-right!" />
                    <DarkTh label="Pending" className="text-right!" />
                    <DarkTh label="Approved %" className="text-right!" />
                  </tr>
                </thead>
                <tbody>
                  {effortProjects.map((p) => (
                    <tr key={p.name} className="border-b border-[#1d2230]">
                      <td className="px-3 py-3 text-sm text-[#c2c9db]">{p.name}</td>
                      <td className="px-3 py-3 text-right text-sm text-white tabular-nums">{p.total}</td>
                      <td className="px-3 py-3 text-right text-sm text-white tabular-nums">{p.approved}</td>
                      <td className="px-3 py-3 text-right text-sm text-white tabular-nums">{p.rejected}</td>
                      <td className="px-3 py-3 text-right text-sm text-white tabular-nums">{p.pending}</td>
                      <td className="px-3 py-3 text-right text-sm font-semibold text-white tabular-nums">{share(p.approved, p.total)}</td>
                    </tr>
                  ))}
                  <tr className="bg-[#1a2030] font-bold text-white">
                    <td className="px-3 py-3 text-sm">Total</td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums">{totals.total}</td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums">{totals.approved}</td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums">{totals.rejected}</td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums">{totals.pending}</td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums">{share(totals.approved, totals.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </DarkPanel>
        ) : null}

        {section === 'resources' ? (
          <DarkPanel>
            <SectionHead n={4} title="Resource-wise efforts summary" />
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <DarkStat label="Active resources" value={effortResources.length} tone="blue" />
              <DarkStat label="Total hours" value={resourceTotals.reduce((n, r) => n + r.total, 0)} unit="hrs" tone="violet" />
              <DarkStat label="Top contributor" value={`${top.name} (${top.total} hrs)`} tone="green" />
            </div>
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-175 border-collapse">
                <thead>
                  <tr>
                    <DarkTh label="Resource" />
                    {effortMonths.map((m) => (
                      <DarkTh key={m.month} label={m.month} className="text-center!" />
                    ))}
                    <DarkTh label="Total" className="text-right!" />
                  </tr>
                </thead>
                <tbody>
                  {resourceTotals.map((r) => (
                    <tr key={r.name}>
                      <td className="border border-[#252a3a] px-3 py-2.5 text-sm text-[#c2c9db]">{r.name}</td>
                      {r.byMonth.map((h, i) => (
                        <td
                          key={effortMonths[i].month}
                          title={h == null ? `${r.name}, ${effortMonths[i].month}: no hours` : `${r.name}, ${effortMonths[i].month}: ${h} hrs`}
                          className="border border-[#252a3a] px-3 py-2.5 text-center text-sm text-white tabular-nums"
                          style={h == null ? undefined : { background: `rgba(96,165,250,${0.12 + (h / resourceMax) * 0.5})` }}
                        >
                          {h ?? <span className="text-[#4b5366]">·</span>}
                        </td>
                      ))}
                      <td className="border border-[#252a3a] px-3 py-2.5 text-right text-sm font-bold text-white tabular-nums">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-[#6e778f]">
              Cell shading scales with hours logged · darker blue = higher load
            </p>
          </DarkPanel>
        ) : null}

        {section === 'po' ? (
          <DarkPanel>
            <SectionHead n={5} title="Project-wise PO summary" />
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              <DarkStat label="Approved hours" value={totals.approved} unit="hrs" tone="green" />
              <DarkStat label="PO issued" value={effortPo.issued} tone="green" />
              <DarkStat label="PO pending" value={effortPo.pending} tone="amber" />
              <DarkStat label="Payment received" value={effortPo.paymentReceived} tone="green" />
              <DarkStat label="Invoice sent" value={effortPo.invoiceSent} tone="blue" />
              <DarkStat label="Payment pending" value={effortPo.paymentPending} tone="amber" />
            </div>
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-150 border-collapse">
                <thead>
                  <tr className="border-b border-[#252a3a]">
                    <DarkTh label="Project" />
                    <DarkTh label="Total hrs" className="text-right!" />
                    <DarkTh label="Approved hrs" className="text-right!" />
                    <DarkTh label="PO status" />
                    <DarkTh label="Payment status" />
                  </tr>
                </thead>
                <tbody>
                  {effortProjects.map((p) => (
                    <tr key={p.name} className="border-b border-[#1d2230]">
                      <td className="px-3 py-3 text-sm text-[#c2c9db]">{p.name}</td>
                      <td className="px-3 py-3 text-right text-sm text-white tabular-nums">{p.total}</td>
                      <td className="px-3 py-3 text-right text-sm text-white tabular-nums">{p.approved}</td>
                      <td className="px-3 py-3">
                        <DarkPill label={p.po.toUpperCase()} color={p.po === 'Yes' ? '#22c55e' : '#ef4444'} />
                      </td>
                      <td className="px-3 py-3">
                        <DarkPill label={p.payment.toUpperCase()} color={PAYMENT_COLOR[p.payment]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DarkPanel>
        ) : null}
      </RailShell>
      <DashNote>
        Recreation on synthetic data · {effortMonths.length} months · {totals.total} hrs · the original reads a Google Sheet and refreshes every 30s
      </DashNote>
    </>
  );
}
