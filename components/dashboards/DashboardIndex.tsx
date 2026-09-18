/**
 * `/dashboards`: the card index.
 *
 * ── A server component, on purpose ────────────────────────────────────────
 * There is no state left on this page: the tab strip it replaced needed
 * `useState` to pick which recreation to mount, and the ten routes under
 * `/dashboards/<id>` do that with URLs instead. Nothing here is interactive
 * beyond the links, so nothing here ships JavaScript, a visitor who lands on
 * the index and leaves has downloaded no recreation code at all, where the
 * tab strip had to bundle all ten to offer them.
 *
 * ── The cards are Tailwind, and the homepage cards are not ────────────────
 * Portfolio.tsx renders its own cards from the same `dashboards` array using
 * the site's hand-written BEM-ish CSS, because a Tailwind grid dropped into
 * that page would ignore the `--ink`/`--sub`/`--line` token set and would not
 * flip under `.portfolio.immersive`. Two presentations of one array is the
 * deliberate trade; `content/dashboards.ts` stays the only source of the
 * words.
 */
import Link from 'next/link';
import { dashboards } from '@/content/dashboards';

export function DashboardIndex() {
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <Link
          href="/"
          className="text-sm text-[#596579] underline-offset-4 hover:underline"
        >
          ← Alex Rivera
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Operational dashboards
        </h1>
        <p className="mt-3 max-w-3xl text-[#596579]">
          Ten dashboards built at Northwind so that delivery status, quality,
          effort and objectives stopped living in spreadsheets and chat
          threads. Each one is rebuilt here on invented data, the layouts, the
          calculations and the controls are the originals; the people, clients,
          projects and numbers are not. Open one to use it.
        </p>
      </header>

      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {dashboards.map((d) => (
          <li key={d.id} className="flex">
            <Link
              href={`/dashboards/${d.id}`}
              data-track-tag={`dashboard-index-${d.id}`}
              className="group flex flex-1 flex-col rounded-2xl border border-[#dce2ec] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#285ce5] hover:shadow-[0_8px_30px_rgba(40,92,229,.10)]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold tracking-[.08em] text-[#596579] uppercase">
                  {d.client ?? 'Internal'}
                </span>
                {d.status === 'retired' ? (
                  <span className="shrink-0 rounded-full bg-[#f0f3f9] px-2 py-0.5 text-[10px] font-bold tracking-[.06em] text-[#596579] uppercase">
                    Retired
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold tracking-[.06em] text-emerald-700 uppercase">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-xl font-bold tracking-tight text-[#172235] group-hover:text-[#285ce5]">
                {d.name}
              </h2>
              <p className="mt-2 flex-1 text-sm text-[#596579]">{d.tagline}</p>
              <p className="mt-4 text-2xl font-bold tracking-tight text-[#172235] tabular-nums">
                {d.metric}
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {d.stack.slice(0, 3).map((s) => (
                  <li
                    key={s}
                    className="rounded-md bg-[#f0f3f9] px-2 py-0.5 text-[11px] text-[#4b5563]"
                  >
                    {s}
                  </li>
                ))}
                {d.stack.length > 3 ? (
                  <li className="px-1 py-0.5 text-[11px] text-[#9ca3af]">
                    +{d.stack.length - 3}
                  </li>
                ) : null}
              </ul>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#285ce5]">
                Open dashboard
                <span
                  aria-hidden
                  className="transition-transform group-hover:translate-x-0.5"
                >
                  →
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 max-w-3xl text-sm text-[#596579]">
        The figure on each card is the original&rsquo;s real volume; the rows
        inside the recreation are fewer and each one says so. Client names are
        withheld throughout, including for the two engagements named elsewhere
        on this site, the same letter always means the same client. The
        originals are internal and sign-in gated, so there is nothing to link
        to.
      </p>
    </main>
  );
}
