/**
 * The section catalogue, DOM-free, so all three consumers can import it.
 *
 * Split out of sections.ts because that module installs an
 * IntersectionObserver and imports the event queue. The ingest route needs the
 * allowlist and the dashboard needs the labels; neither should pull browser
 * machinery into a Worker or a bare Node test process.
 *
 * Same hard constraint as normalise.ts: no DOM reference anywhere in here.
 */

export interface TrackedSection {
  /** DOM id. `'/#' + id` is what lands in QueuedEvent.path. */
  id: string;
  label: string;
  /**
   * `'section'` takes part in the dwell state machine; `'block'` does not.
   *
   * `northwind-erp` and `additional-projects` are nested INSIDE `#work`, so a flat
   * observer would hold two sections active at once and their dwells would sum
   * to more than the session. Blocks produce CTA impressions instead.
   */
  level: 'section' | 'block';
}

/** Order is document order, which the section funnel depends on. */
export const SECTIONS: readonly TrackedSection[] = [
  { id: 'hero', label: 'Hero', level: 'section' },
  { id: 'work', label: 'Selected work', level: 'section' },
  { id: 'northwind-erp', label: 'Northwind ERP', level: 'block' },
  { id: 'dashboards', label: 'Operational dashboards', level: 'section' },
  { id: 'awards', label: 'Recognition', level: 'section' },
  { id: 'about', label: 'About', level: 'section' },
  { id: 'skills', label: 'Toolkit', level: 'section' },
  { id: 'notes', label: 'Learning', level: 'section' },
  { id: 'products', label: 'Professional work', level: 'section' },
  { id: 'certifications', label: 'Certifications', level: 'section' },
  { id: 'recommendations', label: 'Recommendations', level: 'section' },
  { id: 'contact', label: 'Contact', level: 'section' },
];

/**
 * The server-side allowlist.
 *
 * The analog of Lumen's tracked-pages.ts, and it does the same job: an
 * ingest endpoint is open, so a section id outside this set becomes null rather
 * than inventing a row that pollutes the sections table.
 */
export const SECTION_IDS: ReadonlySet<string> = new Set(
  SECTIONS.map((s) => s.id),
);

/** Sections that drive the dwell machine, in document order. */
export const DWELL_SECTIONS: readonly TrackedSection[] = SECTIONS.filter(
  (s) => s.level === 'section',
);

/**
 * Sections that used to exist, kept for their labels only.
 *
 * `additional-projects` was folded into `#products`: every card in it was a
 * product Alex contributed to. Two things had to happen at once, and doing
 * only one of them is a trap either way:
 *
 *   - it leaves SECTIONS, or the section funnel carries a row that can never
 *     be reached again and reads as "nobody got this far" forever, which is
 *     the exact failure this file's sibling comments keep warning about;
 *   - it stays label-resolvable, or every row already in the events table
 *     re-renders as the raw id. Retention is 180 days, so those rows outlive
 *     the section by half a year.
 *
 * It is deliberately NOT in SECTION_IDS: the block is gone from the DOM, so a
 * new row claiming it is not late data, it is a forged one.
 */
const RETIRED_LABELS: Readonly<Record<string, string>> = {
  'additional-projects': 'More projects (retired)',
};

export const MODES: ReadonlySet<string> = new Set(['resume', 'immersive']);

/**
 * `'/#work'` or `'work'` -> `'Selected work'`.
 *
 * An unknown id returns itself rather than something reassuring: a relabelled
 * unknown row reads as real data.
 */
export function sectionLabel(id: string): string {
  const bare = id.replace(/^\/?#/, '');
  return (
    SECTIONS.find((s) => s.id === bare)?.label ?? RETIRED_LABELS[bare] ?? bare
  );
}

/** `'/#work'` -> `'work'`; anything unrecognised -> null. */
export function sectionIdFromPath(path: string): string | null {
  const match = /^\/?#?(.+)$/.exec(path.replace(/^\//, ''));
  const bare = match ? match[1].replace(/^#/, '') : '';
  return SECTION_IDS.has(bare) ? bare : null;
}
