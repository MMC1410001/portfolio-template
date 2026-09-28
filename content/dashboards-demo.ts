/**
 * Synthetic data for the `/dashboards` recreations.
 *
 * ── Every name in this file is invented ────────────────────────────────────
 * People, clients, projects, modules and comments are fabricated. The
 * originals run on live Northwind data: colleague names, client product names,
 * and free-text comments that quote conversations. None of that can be
 * published, and blurring a screenshot is not sanitisation: the layout is the
 * thing worth showing, so the layout is reproduced exactly and the contents
 * are replaced.
 *
 * ── Shape is faithful; values are not ─────────────────────────────────────
 * Column structure, grouping, status vocabulary, score weightings and the
 * department split are as they are in the originals, because those encode how
 * the team actually works. The numbers are chosen to exercise the design
 * rather than to match production on the day the screenshot was taken, the
 * real delivery board happened to be 15-of-15 live, which renders three empty
 * pipeline stages and shows a reader nothing about what the board does when
 * work is in flight.
 *
 * ── Roster is shared across dashboards on purpose ─────────────────────────
 * The same invented people recur, because they do in the originals: an owner
 * on the delivery board is a task owner on the payroll board and a name on the
 * learning tracker. A showcase that reseeded names per page would lose that.
 *
 * ── Row counts are smaller than the originals, and say so ─────────────────
 * The defect board runs on 199 records and the OKR dashboard on 108 employees.
 * Shipping either in full would put tens of kilobytes of invented rows into
 * the bundle to demonstrate a table that a tenth of them already demonstrates.
 * Each recreation states the original's real volume in its footer instead, and
 * `*_TOTAL` constants in each board's data file carry it so the claim cannot
 * drift from the text.
 */

// ── One module per recreation, re-exported here ──────────────────────────
// The rows used to live in this file, and every recreation imported from it,
// so every dashboard page downloaded every board's rows: opening the uptime
// board downloaded the OKR table. Each board now imports its own file
// under content/dashboards-data/, and this barrel exists for the tests and
// for anything that wants the whole set as one namespace.
export * from './dashboards-data/common';
export * from './dashboards-data/portfolio';
export * from './dashboards-data/action-plan';
export * from './dashboards-data/release-plan';
export * from './dashboards-data/scorecard';
export * from './dashboards-data/effort';
export * from './dashboards-data/quality';
export * from './dashboards-data/defects';
export * from './dashboards-data/learners';
export * from './dashboards-data/readiness';
export * from './dashboards-data/okr';
export * from './dashboards-data/uptime';
