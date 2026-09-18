/**
 * The panel's own sections, declared once.
 *
 * The nav, the scroll-spy and the shell all read this list, so a new panel is
 * one entry rather than three edits that can disagree.
 */

export interface AdminNavSection {
  id: string;
  label: string;
  /** One line under the heading, saying what the panel answers. */
  blurb: string;
}

export const ADMIN_SECTIONS: readonly AdminNavSection[] = [
  {
    id: 'admin-overview',
    label: 'Overview',
    blurb: 'Sessions, engagement, and how far people get.',
  },
  // There was an 'admin-sections' entry here. Nothing ever rendered a region
  // with that id, so the sidebar carried a link that scrolled nowhere, and
  // the scroll-spy silently skipped it, because getElementById returned null.
  // Its content was never missing: AnalyticsPanel already renders both the
  // section funnel and the per-section table, so the entry was redundant
  // rather than unimplemented.
  {
    id: 'admin-clicks',
    label: 'Clicks & friction',
    blurb: 'What gets clicked, what was seen, and what does nothing.',
  },
  {
    id: 'admin-heatmap',
    label: 'Heatmap',
    blurb: 'Click positions drawn over the real page.',
  },
  {
    id: 'admin-audience',
    label: 'Audience',
    blurb: 'New against returning, devices, and rough location.',
  },
  {
    id: 'admin-chat',
    label: 'Chatbot',
    blurb: 'What people ask, and what the portfolio guide cannot answer.',
  },
  {
    id: 'admin-campaigns',
    label: 'Campaigns',
    blurb: 'Where tagged links and ad clicks came from.',
  },
  {
    id: 'admin-sessions',
    label: 'Sessions',
    blurb: 'Individual visits, for when a number looks wrong.',
  },
];

const BY_ID = new Map(ADMIN_SECTIONS.map((s) => [s.id, s]));

/**
 * A section by id, throwing rather than returning undefined.
 *
 * The shell used to index this list positionally (`ADMIN_SECTIONS[4]`) which
 * is how the dead 'admin-sections' entry survived: the nav rendered every
 * entry while the shell rendered a hand-picked subset, and the two could not
 * be checked against each other. Positional access also means removing any
 * entry silently relabels every panel after it.
 *
 * Throwing is deliberate. A mistyped id is a build-time-shaped mistake that
 * would otherwise surface as an untitled panel nobody notices.
 */
export function adminSection(id: string): AdminNavSection {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown admin section: ${id}`);
  return found;
}
