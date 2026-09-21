'use client';
/**
 * One dashboard, at `/dashboards/<id>`.
 *
 * ── Why one route per dashboard rather than one page with a tab strip ─────
 * The tab strip that used to live here was reachable only from a text link in
 * the corner of `#products`, and a visitor who never clicked it never learned
 * these existed. Cards on the homepage fix the discovery half; a real URL
 * fixes the other half, a card can only link somewhere if there is a
 * somewhere. A per-dashboard route also means each one can carry its own
 * title and description, be shared on its own, and be opened directly from a
 * CV or a message, none of which a `useState` tab index can do.
 *
 * ── `RECREATIONS` is keyed by id, and the ids must match ──────────────────
 * A dashboard in `content/dashboards.ts` with no entry here renders the
 * "recreation in progress" note rather than failing, which is the right
 * behaviour while one is being built and the wrong thing to ship. The check
 * lives in `tests/dashboards.test.ts`, which reads this file as text rather
 * than importing it, a bare Node process cannot import a React client
 * component, which is the same constraint that keeps
 * `lib/analytics/normalise.ts` off the DOM.
 *
 * ── Only the selected recreation is mounted ──────────────────────────────
 * That was true of the tab strip and it is still true here, now for free:
 * the route renders one dashboard, so the other nine never reach the DOM.
 */
import Link from 'next/link';
import { dashboards, type Dashboard } from '@/content/dashboards';
import { ActionPlanBoard } from './ActionPlanBoard';
import { DefectIntelligenceBoard } from './DefectIntelligenceBoard';
import { EffortApprovalBoard } from './EffortApprovalBoard';
import { LearningTracker } from './LearningTracker';
import { OkrBoard } from './OkrBoard';
import { PortfolioBoard } from './PortfolioBoard';
import { PortfolioQualityBoard } from './PortfolioQualityBoard';
import { QualityScorecard } from './QualityScorecard';
import { ReleasePlanBoard } from './ReleasePlanBoard';
import { ReleaseReadinessBoard } from './ReleaseReadinessBoard';
import { UptimeBoard } from './UptimeBoard';

const RECREATIONS: Record<string, () => React.ReactElement> = {
  'automation-portfolio': PortfolioBoard,
  'payroll-action-plan': ActionPlanBoard,
  'release-plan': ReleasePlanBoard,
  'quality-scorecard': QualityScorecard,
  'effort-approval': EffortApprovalBoard,
  'portfolio-quality': PortfolioQualityBoard,
  'defect-intelligence': DefectIntelligenceBoard,
  'learning-tracker': LearningTracker,
  'release-readiness': ReleaseReadinessBoard,
  'okr-dashboard': OkrBoard,
  'uptime-monitoring': UptimeBoard,
};

export function DashboardDetail({ dashboard }: { dashboard: Dashboard }) {
  const Recreation = RECREATIONS[dashboard.id];
  const i = dashboards.findIndex((d) => d.id === dashboard.id);
  const prev = i > 0 ? dashboards[i - 1] : undefined;
  const next = i < dashboards.length - 1 ? dashboards[i + 1] : undefined;

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-10 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="text-sm text-[#596579]">
        <Link href="/" className="underline-offset-4 hover:underline">
          Alex Rivera
        </Link>
        <span aria-hidden> / </span>
        <Link
          href="/dashboards"
          data-track-tag="dashboard-back-to-index"
          className="underline-offset-4 hover:underline"
        >
          Operational dashboards
        </Link>
      </nav>

      <header className="mt-4 mb-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {dashboard.name}
        </h1>
        <p className="mt-2 max-w-3xl text-lg text-[#596579]">
          {dashboard.tagline}
        </p>
      </header>

      <section className="mb-6 grid gap-6 rounded-2xl border border-[#dce2ec] bg-white p-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="text-xs font-semibold tracking-[.08em] text-[#596579] uppercase">
            Why it exists
          </h2>
          <p className="mt-2 text-[#172235]">{dashboard.purpose}</p>
          <h2 className="mt-5 text-xs font-semibold tracking-[.08em] text-[#596579] uppercase">
            What it shows
          </h2>
          <p className="mt-2 text-[#172235]">{dashboard.shows}</p>
        </div>
        <div>
          <h2 className="text-xs font-semibold tracking-[.08em] text-[#596579] uppercase">
            Built with
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {dashboard.stack.map((s) => (
              <li
                key={s}
                className="rounded-md bg-[#f0f3f9] px-2.5 py-1 text-sm text-[#374151]"
              >
                {s}
              </li>
            ))}
          </ul>
          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="text-[#596579]">Audience</dt>
              <dd className="font-medium">{dashboard.client ?? 'Internal'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-[#596579]">Scale</dt>
              <dd className="font-medium">{dashboard.metric}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-[#596579]">Status</dt>
              <dd className="font-medium capitalize">{dashboard.status}</dd>
            </div>
          </dl>
        </div>
      </section>

      {Recreation ? (
        <Recreation />
      ) : (
        <p className="rounded-xl border border-dashed border-[#dce2ec] p-10 text-center text-[#596579]">
          Recreation in progress.
        </p>
      )}

      <nav
        aria-label="Other dashboards"
        className="mt-8 flex flex-wrap items-stretch justify-between gap-4 border-t border-[#dce2ec] pt-6"
      >
        {prev ? (
          <Link
            href={`/dashboards/${prev.id}`}
            data-track-tag={`dashboard-prev-${prev.id}`}
            className="max-w-sm flex-1 rounded-xl border border-[#dce2ec] p-4 transition hover:border-[#285ce5]"
          >
            <span className="block text-xs font-semibold tracking-[.08em] text-[#596579] uppercase">
              ← Previous
            </span>
            <span className="mt-1 block font-semibold text-[#172235]">
              {prev.name}
            </span>
          </Link>
        ) : (
          <span className="flex-1" />
        )}
        {next ? (
          <Link
            href={`/dashboards/${next.id}`}
            data-track-tag={`dashboard-next-${next.id}`}
            className="max-w-sm flex-1 rounded-xl border border-[#dce2ec] p-4 text-right transition hover:border-[#285ce5]"
          >
            <span className="block text-xs font-semibold tracking-[.08em] text-[#596579] uppercase">
              Next →
            </span>
            <span className="mt-1 block font-semibold text-[#172235]">
              {next.name}
            </span>
          </Link>
        ) : (
          <span className="flex-1" />
        )}
      </nav>

      <p className="mt-8 max-w-3xl text-sm text-[#596579]">
        Rebuilt on invented data. The layouts, the calculations and the controls
        are the originals; the people, clients, projects and numbers are not.
        Client names are withheld throughout, including for the two engagements
        named elsewhere on this site: a page that identified some clients and
        not others would invite the reader to work out which anonymous one is
        which. The same letter always means the same client. The originals are
        internal and sign-in gated, so there is nothing to link to.
      </p>
    </main>
  );
}
