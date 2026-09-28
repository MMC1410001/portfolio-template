/**
 * `/dashboards`: the index of the operational dashboards.
 *
 * Statically rendered, like `/analytics` and for the same reason: the data is
 * a committed module, so there is nothing to fetch, nothing to authorise and
 * nothing that can fail at request time. There is deliberately no database
 * call and no admin API call anywhere beneath this route.
 *
 * This page used to hold the dashboards themselves behind a tab strip. They
 * now live at `/dashboards/<id>`. See the header of DashboardDetail.tsx for
 * why a URL each was worth the extra route.
 */
import type { Metadata } from 'next';
import { DashboardIndex } from '@/components/dashboards/DashboardIndex';
import { dashboards, numberWord } from '@/content/dashboards';
import { profile } from '@/content/portfolio';

// The count is read from the content module, never written out: "Ten" sat
// here beside eleven cards until tests/dashboards.test.ts started checking.
const count = numberWord(dashboards.length, true);

export const metadata: Metadata = {
  title: 'Operational dashboards, on sample data',
  description:
    `${count} delivery, quality, effort, OKR and uptime dashboards built at Northwind for organisational visibility, rebuilt here on synthetic data with every name and figure changed.`,
  alternates: { canonical: '/dashboards' },
  openGraph: {
    title: 'Operational dashboards, on sample data',
    description:
      `${count} delivery, quality, effort, OKR and uptime dashboards rebuilt on synthetic data.`,
    url: '/dashboards',
    type: 'website',
    // Repeated from the root layout: an openGraph here replaces that one whole.
    images: [{ url: profile.avatar, width: 720, height: 720, alt: profile.name }],
  },
};

export default function DashboardsPage() {
  return <DashboardIndex />;
}
