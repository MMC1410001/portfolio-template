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
 * `*_TOTAL` constants below carry it so the claim cannot drift from the text.
 */

export interface Person {
  name: string;
  initials: string;
  /** Tailwind classes for the avatar chip. Assigned per person, stable. */
  tone: string;
}

const person = (name: string, tone: string): Person => ({
  name,
  initials: name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase(),
  tone,
});

export const ROSTER = {
  vikram: person('Vikram Joshi', 'bg-teal-100 text-teal-700'),
  meera: person('Meera Pillai', 'bg-violet-100 text-violet-700'),
  farhan: person('Farhan Sheikh', 'bg-amber-100 text-amber-700'),
  tanvi: person('Tanvi Desai', 'bg-rose-100 text-rose-700'),
  arjun: person('Arjun Nair', 'bg-sky-100 text-sky-700'),
  rohan: person('Rohan Mehta', 'bg-teal-100 text-teal-700'),
  ananya: person('Ananya Rao', 'bg-orange-100 text-orange-700'),
  kabir: person('Kabir Shah', 'bg-indigo-100 text-indigo-700'),
  neha: person('Neha Iyer', 'bg-emerald-100 text-emerald-700'),
  sana: person('Sana Qureshi', 'bg-fuchsia-100 text-fuchsia-700'),
  priya: person('Priya Menon', 'bg-blue-100 text-blue-700'),
  riya: person('Riya Kapoor', 'bg-cyan-100 text-cyan-700'),
} as const;

const P = ROSTER;

/* ────────────────────────────── 1 · delivery board ─────────────────────── */

export type ProjectStatus =
  | 'Live'
  | 'UAT Testing'
  | 'In Development'
  | 'BRD Pending';

export type Department = 'HR' | 'Project' | 'HR and Finance';

export interface PortfolioRow {
  sr: number;
  project: string;
  department: Department;
  /** null renders as the original's italic "To be decided". */
  start: string | null;
  end: string | null;
  days: number | null;
  status: ProjectStatus;
  owner: Person;
  dev: Person[];
  qa: Person[];
  business: Person[];
  comment: string | null;
}

export const portfolioRows: PortfolioRow[] = [
  { sr: 1, project: 'Offer letter and NDA workflow: Phase 1', department: 'HR', start: '23 Mar 2026', end: '23 Apr 2026', days: 31, status: 'Live', owner: P.vikram, dev: [P.rohan], qa: [P.neha], business: [P.priya], comment: null },
  { sr: 2, project: 'Payroll run: Phase 1', department: 'HR and Finance', start: '11 May 2026', end: '24 May 2026', days: 13, status: 'Live', owner: P.vikram, dev: [P.ananya, P.kabir], qa: [P.neha, P.sana], business: [P.priya, P.riya], comment: null },
  { sr: 4, project: 'Document management system', department: 'Project', start: '11 May 2026', end: '14 May 2026', days: 3, status: 'Live', owner: P.meera, dev: [P.rohan, P.kabir], qa: [P.sana], business: [P.riya], comment: null },
  { sr: 5, project: 'Timesheet approvals', department: 'Project', start: '19 May 2026', end: '29 May 2026', days: 10, status: 'Live', owner: P.meera, dev: [P.ananya], qa: [P.neha], business: [P.priya], comment: null },
  { sr: 7, project: 'Employee onboarding checklist', department: 'HR', start: '2 Jun 2026', end: '12 Jun 2026', days: 10, status: 'Live', owner: P.farhan, dev: [P.kabir], qa: [P.sana], business: [P.priya], comment: null },
  { sr: 9, project: 'Vendor onboarding', department: 'Project', start: '8 Jun 2026', end: '26 Jun 2026', days: 18, status: 'Live', owner: P.vikram, dev: [P.rohan], qa: [P.neha], business: [P.riya], comment: null },
  { sr: 11, project: 'Appraisal cycle forms', department: 'HR', start: '15 Jun 2026', end: '30 Jun 2026', days: 15, status: 'Live', owner: P.tanvi, dev: [P.ananya], qa: [P.sana], business: [P.priya], comment: null },
  { sr: 14, project: 'Client billing tracker', department: 'Project', start: '22 Jun 2026', end: '3 Jul 2026', days: 11, status: 'Live', owner: P.meera, dev: [P.kabir], qa: [P.neha], business: [P.riya], comment: null },
  { sr: 16, project: 'Shift roster requests', department: 'HR', start: '29 Jun 2026', end: '10 Jul 2026', days: 11, status: 'Live', owner: P.farhan, dev: [P.rohan], qa: [P.sana], business: [P.priya], comment: null },
  { sr: 18, project: 'Release calendar', department: 'Project', start: '1 Jul 2026', end: '9 Jul 2026', days: 8, status: 'Live', owner: P.arjun, dev: [P.ananya], qa: [P.neha], business: [P.riya], comment: null },
  { sr: 19, project: 'Asset management dashboard', department: 'Project', start: '3 Jul 2026', end: '5 Jul 2026', days: 2, status: 'Live', owner: P.vikram, dev: [P.kabir], qa: [], business: [P.vikram], comment: 'Enhancement scoped and estimated. Deploying to production once the owner signs off.' },
  { sr: 21, project: 'Incident log', department: 'Project', start: '13 Jul 2026', end: '24 Jul 2026', days: 11, status: 'UAT Testing', owner: P.meera, dev: [P.rohan], qa: [P.neha, P.sana], business: [P.riya], comment: 'Two defects open against the escalation rules.' },
  { sr: 22, project: 'Leave request calculation', department: 'HR', start: '20 Jul 2026', end: '31 Jul 2026', days: 11, status: 'UAT Testing', owner: P.farhan, dev: [P.ananya], qa: [P.sana], business: [P.priya], comment: null },
  { sr: 23, project: 'Remote-work request flow', department: 'HR', start: '3 Aug 2026', end: '14 Aug 2026', days: 11, status: 'In Development', owner: P.farhan, dev: [P.kabir], qa: [P.neha], business: [P.priya], comment: null },
  { sr: 28, project: 'Exit letter automation', department: 'HR', start: null, end: null, days: null, status: 'BRD Pending', owner: P.tanvi, dev: [], qa: [], business: [], comment: 'Requirements workshop booked with HR.' },
];

/* ───────────────────────────── 2 · action plan ─────────────────────────── */

export type TaskStatus = 'Completed' | 'In Progress' | 'To be picked up';

export interface TaskRow {
  sr: string;
  task: string;
  hrs: number;
  tentative: [string, string];
  owner: Person;
  /** Open-ended once started: the end date is null until the task closes. */
  actual: [string, string | null] | null;
  status: TaskStatus;
  comment: string | null;
}

export const actionPlanRows: TaskRow[] = [
  { sr: '1', task: 'Requirement and scope document with end-to-end flow diagrams from business users', hrs: 18, tentative: ['11 May 2026', '12 May 2026'], owner: P.priya, actual: ['11 May 2026', '18 May 2026'], status: 'Completed', comment: 'Further changes were suggested on the BRD; sign-off received on 18 May.' },
  { sr: '2', task: 'Modifying codebase to match existing platform functionality', hrs: 45, tentative: ['13 May 2026', '25 May 2026'], owner: P.ananya, actual: ['12 May 2026', '19 May 2026'], status: 'Completed', comment: null },
  { sr: '2.1', task: 'Repository setup', hrs: 1, tentative: ['12 May 2026', '12 May 2026'], owner: P.kabir, actual: ['12 May 2026', '12 May 2026'], status: 'Completed', comment: null },
  { sr: '2.2', task: 'Existing project setup', hrs: 2, tentative: ['12 May 2026', '12 May 2026'], owner: P.ananya, actual: ['12 May 2026', '12 May 2026'], status: 'Completed', comment: null },
  { sr: '2.3', task: 'Understanding the existing project', hrs: 12, tentative: ['12 May 2026', '13 May 2026'], owner: P.rohan, actual: ['12 May 2026', '13 May 2026'], status: 'Completed', comment: 'Walkthrough taken from both the HR and Finance teams.' },
  { sr: '2.4', task: 'Coding the new functionality', hrs: 20, tentative: ['13 May 2026', '18 May 2026'], owner: P.rohan, actual: ['14 May 2026', '18 May 2026'], status: 'Completed', comment: null },
  { sr: '2.5', task: 'Integrating the new functionality with the existing code', hrs: 10, tentative: ['19 May 2026', '20 May 2026'], owner: P.kabir, actual: ['19 May 2026', '19 May 2026'], status: 'Completed', comment: null },
  { sr: '3', task: 'Code review', hrs: 2.5, tentative: ['20 May 2026', '20 May 2026'], owner: P.vikram, actual: ['20 May 2026', '20 May 2026'], status: 'Completed', comment: null },
  { sr: '4', task: 'Merging the new functionality into the existing codebase', hrs: 1, tentative: ['20 May 2026', '20 May 2026'], owner: P.vikram, actual: ['20 May 2026', '20 May 2026'], status: 'Completed', comment: null },
  { sr: '6', task: 'Developer sanity on the local environment', hrs: 1, tentative: ['21 May 2026', '21 May 2026'], owner: P.rohan, actual: ['21 May 2026', '21 May 2026'], status: 'Completed', comment: null },
  { sr: '7', task: 'Deployment to UAT', hrs: 0.5, tentative: ['21 May 2026', '21 May 2026'], owner: P.vikram, actual: ['21 May 2026', '21 May 2026'], status: 'Completed', comment: null },
  { sr: '8', task: 'User guide creation', hrs: 4, tentative: ['21 May 2026', '22 May 2026'], owner: P.neha, actual: ['22 May 2026', '22 May 2026'], status: 'Completed', comment: null },
  { sr: '9', task: 'QA testing on UAT', hrs: 15, tentative: ['22 May 2026', '26 May 2026'], owner: P.neha, actual: ['22 May 2026', null], status: 'In Progress', comment: 'Payroll variance cases still to run.' },
  { sr: '10', task: 'User testing on UAT: Finance team', hrs: 12, tentative: ['23 May 2026', '27 May 2026'], owner: P.riya, actual: ['24 May 2026', null], status: 'In Progress', comment: null },
  { sr: '11', task: 'User testing on UAT: HR team', hrs: 8, tentative: ['23 May 2026', '27 May 2026'], owner: P.priya, actual: null, status: 'To be picked up', comment: null },
  { sr: '12', task: 'Production deployment and hypercare', hrs: 3, tentative: ['28 May 2026', '29 May 2026'], owner: P.vikram, actual: null, status: 'To be picked up', comment: null },
];

export const actionPlanMembers = [
  { person: P.neha, role: 'User guide creation · QA testing on UAT', hrs: 19, done: 2, owner: false },
  { person: P.riya, role: 'User testing on UAT: Finance team', hrs: 12, done: 1, owner: false },
  { person: P.priya, role: 'User testing on UAT: HR team', hrs: 8, done: 1, owner: false },
  { person: P.vikram, role: 'Project owner', hrs: 6, done: 3, owner: true },
];

/** The four-step stepper above the task table. Index of the live step. */
export const actionPlanPhases = [
  'Requirements',
  'Development',
  'UAT Testing',
  'Live',
] as const;
export const actionPlanCurrentPhase = 2;
export const actionPlanLiveDate = '29th May 2026';

/* ───────────────────────────── 3 · release plan ────────────────────────── */

export type ReleaseStage =
  | 'Live'
  | 'UAT'
  | 'Development'
  | 'Design'
  | 'To Be Picked'
  | 'Deferred';

export type Priority = 'P0' | 'P1' | 'P2';

export interface ReleaseRow {
  n: number;
  feature: string;
  priority: Priority;
  workType: 'Enhancement' | 'Strategic Initiative' | 'Defect Fix' | 'New Build';
  stage: ReleaseStage;
  project: string;
  pm: Person;
  em: Person;
  goLive: string;
}

export const releaseRows: ReleaseRow[] = [
  { n: 1, feature: 'Retirement calculator', priority: 'P0', workType: 'Enhancement', stage: 'UAT', project: 'Web', pm: P.meera, em: P.arjun, goLive: 'Jun 10' },
  { n: 2, feature: 'Blog homepage: design change', priority: 'P1', workType: 'Enhancement', stage: 'Development', project: 'Web', pm: P.meera, em: P.arjun, goLive: 'Jun 19' },
  { n: 3, feature: 'Money-basics page revamp', priority: 'P1', workType: 'Enhancement', stage: 'Live', project: 'Web', pm: P.meera, em: P.arjun, goLive: 'Jun 04' },
  { n: 4, feature: 'Conclave post-event page', priority: 'P1', workType: 'Enhancement', stage: 'Design', project: 'Web', pm: P.meera, em: P.arjun, goLive: 'Jun 19' },
  { n: 5, feature: 'Advisory landing page', priority: 'P2', workType: 'Strategic Initiative', stage: 'To Be Picked', project: 'Web', pm: P.meera, em: P.arjun, goLive: 'Jun 29' },
  { n: 6, feature: 'Onboarding journey: step 2 rework', priority: 'P0', workType: 'New Build', stage: 'Development', project: 'Core platform', pm: P.tanvi, em: P.kabir, goLive: 'Jun 22' },
  { n: 7, feature: 'Document vault: bulk upload', priority: 'P1', workType: 'New Build', stage: 'Development', project: 'Core platform', pm: P.tanvi, em: P.kabir, goLive: 'Jun 25' },
  { n: 8, feature: 'Portfolio summary export', priority: 'P2', workType: 'Enhancement', stage: 'To Be Picked', project: 'Core platform', pm: P.tanvi, em: P.kabir, goLive: 'Jun 30' },
  { n: 9, feature: 'Session timeout handling', priority: 'P0', workType: 'Defect Fix', stage: 'UAT', project: 'Core platform', pm: P.tanvi, em: P.rohan, goLive: 'Jun 12' },
  { n: 10, feature: 'Consent capture rewrite', priority: 'P0', workType: 'Strategic Initiative', stage: 'Design', project: 'Compliance', pm: P.farhan, em: P.rohan, goLive: 'Jun 27' },
  { n: 11, feature: 'Audit trail retention', priority: 'P1', workType: 'Enhancement', stage: 'Development', project: 'Compliance', pm: P.farhan, em: P.rohan, goLive: 'Jun 24' },
  { n: 12, feature: 'Access review report', priority: 'P2', workType: 'Enhancement', stage: 'Deferred', project: 'Compliance', pm: P.farhan, em: P.rohan, goLive: 'Jul 08' },
  { n: 13, feature: 'Payment retry logic', priority: 'P0', workType: 'Defect Fix', stage: 'Live', project: 'Payments', pm: P.vikram, em: P.ananya, goLive: 'Jun 06' },
  { n: 14, feature: 'Refund status webhook', priority: 'P1', workType: 'New Build', stage: 'UAT', project: 'Payments', pm: P.vikram, em: P.ananya, goLive: 'Jun 17' },
  { n: 15, feature: 'Statement download throttle', priority: 'P2', workType: 'Enhancement', stage: 'To Be Picked', project: 'Payments', pm: P.vikram, em: P.ananya, goLive: 'Jun 30' },
  { n: 16, feature: 'Advisor search relevance', priority: 'P1', workType: 'Enhancement', stage: 'Development', project: 'Discovery', pm: P.meera, em: P.kabir, goLive: 'Jun 20' },
  { n: 17, feature: 'Recommendation surface: v2', priority: 'P0', workType: 'Strategic Initiative', stage: 'Design', project: 'Discovery', pm: P.meera, em: P.kabir, goLive: 'Jun 28' },
  { n: 18, feature: 'Notification preferences', priority: 'P2', workType: 'Enhancement', stage: 'Live', project: 'Discovery', pm: P.meera, em: P.kabir, goLive: 'Jun 02' },
];

export const RELEASE_TOTAL = 49;
export const releaseMonth = 'June 2026';

/** The process pages the original carries beside the plan. */
export const deliveryHierarchy = [
  { level: 1, name: 'Organisation OKR', artifact: 'OKR document' },
  { level: 2, name: 'Epic', artifact: 'Epic document' },
  { level: 3, name: 'Feature', artifact: 'Feature brief' },
  { level: 4, name: 'User story', artifact: 'User story document' },
  { level: 5, name: 'Deliverable', artifact: 'Deliverable tracker' },
] as const;

export const lifecycleStages = [
  'Business problem identification',
  'OKR mapping',
  'Epic definition',
  'Feature discovery',
  'Concept note',
  'Solution design',
  'UX / wireframe',
  'User story creation',
  'Engineering task breakdown',
  'Development',
  'QA and UAT',
  'Release',
  'Feedback and iteration',
] as const;

export const lifecycleContrast = [
  { aspect: 'Discovery', before: 'Manual discovery', after: 'AI-assisted discovery' },
  { aspect: 'Documentation', before: 'Longer documentation time', after: 'Faster, AI-supported documentation' },
  { aspect: 'Feedback', before: 'Late feedback', after: 'Early business validation' },
  { aspect: 'Execution', before: 'Slower, sequential cycles', after: 'Parallel product, design and engineering work' },
  { aspect: 'Quality', before: 'Higher rework', after: 'Improved quality, reduced rework' },
] as const;

export const agileCycle = [
  'Sprint planning',
  'Backlog grooming',
  'User story refinement',
  'Daily standup',
  'Sprint execution',
  'QA testing',
  'UAT',
  'Sprint review',
  'Retrospective',
  'Release planning',
] as const;

export const definitionOfReady = [
  'Story has clear acceptance criteria',
  'Dependencies identified',
  'Estimated by the team',
  'Business owner aligned',
] as const;

export const definitionOfDone = [
  'Code reviewed and merged',
  'Unit and integration tests passing',
  'QA sign-off complete',
  'Documentation updated',
  'UAT approved by business owner',
] as const;

/* ──────────────────────────── 4 · quality scorecard ────────────────────── */

export interface ScorecardProduct {
  id: string;
  name: string;
  score: number;
  ready: boolean;
  /** Movement since the previous report. */
  delta: number;
  headline: string;
  summary: string;
  breakdown: { reliability: number; speed: number; inclusive: number };
  defects: {
    closed: number;
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  risk: string;
  automation: number;
}

export const scorecardProducts: ScorecardProduct[] = [
  {
    id: 'dealer-api',
    name: 'Partner data API',
    score: 100,
    ready: true,
    delta: 20,
    headline: 'APIs are in production and there are no open issues.',
    summary:
      'Tested across 200+ scenarios covering multiple areas, with a 100% pass rate. Every issue found during testing has been fixed and verified. The system stayed stable under peak usage with no crashes or slowdowns, and is performing reliably for real-world demand.',
    breakdown: { reliability: 100, speed: 100, inclusive: 100 },
    defects: { closed: 18, total: 18, critical: 0, high: 0, medium: 0, low: 0 },
    risk: 'Data-heavy endpoints such as product search slow down under high user load and may affect response times during peak usage.',
    automation: 100,
  },
  {
    id: 'field-assistant',
    name: 'Field sales assistant',
    score: 99,
    ready: true,
    delta: 8,
    headline: 'On production.',
    summary:
      'All critical journeys pass end to end. One cosmetic defect remains open against the summary screen and is scheduled for the next patch.',
    breakdown: { reliability: 99, speed: 98, inclusive: 96 },
    defects: { closed: 41, total: 42, critical: 0, high: 0, medium: 0, low: 1 },
    risk: 'Offline sync has only been exercised on the two handset models the field team currently carries.',
    automation: 86,
  },
  {
    id: 'product-chatbot',
    name: 'Product chatbot',
    score: 95,
    ready: true,
    delta: 20.3,
    headline:
      'Answers product questions reliably, and its performance is consistent.',
    summary:
      'Response quality was scored against a fixed question set across product, pricing and availability. Accuracy held above the agreed threshold on every rerun.',
    breakdown: { reliability: 96, speed: 94, inclusive: 90 },
    defects: { closed: 27, total: 29, critical: 0, high: 1, medium: 1, low: 0 },
    risk: 'Long multi-turn conversations occasionally lose earlier context and restate an answer already given.',
    automation: 74,
  },
  {
    id: 'letter-generation',
    name: 'Scheme letter generation',
    score: 78,
    ready: false,
    delta: -1.5,
    headline: 'Delivery currently targets a demo pilot release only.',
    summary:
      'The generation path works for the templates in scope. Coverage outside those templates is untested, and the pilot scope is deliberately narrow.',
    breakdown: { reliability: 82, speed: 76, inclusive: 62 },
    defects: { closed: 9, total: 16, critical: 1, high: 3, medium: 2, low: 1 },
    risk: 'Template variants outside the pilot set have not been exercised at all; a wider release would be testing in production.',
    automation: 31,
  },
  {
    id: 'custom-dev',
    name: 'Custom scheme development',
    score: 75,
    ready: false,
    delta: 10.4,
    headline: 'Coding errors surface instead of proper error messages.',
    summary:
      'Functional coverage is improving, but failure handling is not presentable: unhandled exceptions reach the user in place of a message describing what went wrong.',
    breakdown: { reliability: 78, speed: 80, inclusive: 55 },
    defects: { closed: 14, total: 25, critical: 2, high: 5, medium: 3, low: 1 },
    risk: 'Error states are unhandled across several flows; a user hitting one has no way to recover without support.',
    automation: 24,
  },
];

/* ───────────────────────────── 5 · effort report ───────────────────────── */

export interface EffortMonth {
  month: string;
  hours: number;
}

export const effortMonths: EffortMonth[] = [
  { month: 'Nov 2025', hours: 381 },
  { month: 'Dec 2025', hours: 329 },
  { month: 'Jan 2026', hours: 291 },
  { month: 'Feb 2026', hours: 375 },
  { month: 'Mar 2026', hours: 419 },
  { month: 'Apr 2026', hours: 583 },
];

export type PoStatus = 'Yes' | 'No';
export type PaymentStatus = 'Payment received' | 'Invoice sent' | 'Pending';

export interface EffortProject {
  name: string;
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  po: PoStatus;
  payment: PaymentStatus;
}

export const effortProjects: EffortProject[] = [
  { name: 'Assistant and partner data extraction APIs', total: 755, approved: 500, rejected: 44, pending: 211, po: 'Yes', payment: 'Payment received' },
  { name: 'Scheme automation', total: 611, approved: 200, rejected: 0, pending: 411, po: 'Yes', payment: 'Payment received' },
  { name: 'Product chatbot', total: 462, approved: 144, rejected: 103, pending: 215, po: 'Yes', payment: 'Invoice sent' },
  { name: 'Custom scheme development', total: 324, approved: 0, rejected: 0, pending: 324, po: 'No', payment: 'Pending' },
  { name: 'Scheme letter generation', total: 123, approved: 0, rejected: 0, pending: 123, po: 'No', payment: 'Pending' },
  { name: 'DevOps', total: 103, approved: 0, rejected: 0, pending: 103, po: 'No', payment: 'Pending' },
];

export interface EffortResource {
  name: string;
  /** Hours per month, aligned to `effortMonths`. null renders as the dot. */
  byMonth: (number | null)[];
}

export const effortResources: EffortResource[] = [
  { name: 'Dev pool', byMonth: [207, 177, 136, 168, 138, 178] },
  { name: 'Arjun N.', byMonth: [174, 152, 121, 52, 58, 30] },
  { name: 'Rohan M.', byMonth: [null, null, null, 54, 101, 134] },
  { name: 'Neha I.', byMonth: [null, null, null, 65, 40, 90] },
  { name: 'Kabir S.', byMonth: [null, null, 34, 36, 52, 71] },
  { name: 'Sana Q.', byMonth: [null, null, null, 4, 52, 34] },
  { name: 'Ananya R.', byMonth: [null, null, null, null, 42, 26] },
  { name: 'Tanvi D.', byMonth: [null, null, null, 21, 19, 12] },
  { name: 'Riya K.', byMonth: [null, null, null, 4, 12, 4] },
];

export const effortKickoff = '01 Nov 2025';

export const effortPo = {
  issued: 3,
  pending: 3,
  paymentReceived: 2,
  invoiceSent: 1,
  paymentPending: 3,
};

/* ──────────────────────── 6 · delivery-wide quality ────────────────────── */

export interface QualityEngagement {
  id: string;
  name: string;
  /** Out of 10, as the original shows it. */
  score: number;
  verdict: string;
  verdictNote: string;
  weights: { testPass: number; performance: number; accessibility: number };
  tests: {
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    notRun: number;
  };
  defects: { critical: number; high: number; medium: number; low: number };
  group: 'northwind' | 'group';
}

export const qualityEngagements: QualityEngagement[] = [
  {
    id: 'alpha',
    name: 'Engagement Alpha',
    score: 9.9,
    verdict: 'Production ready',
    verdictNote: 'Excellent quality across all tested modules. Safe to release.',
    weights: { testPass: 99.3, performance: 95, accessibility: 95 },
    tests: { total: 440, passed: 437, failed: 3, blocked: 0, notRun: 0 },
    defects: { critical: 14, high: 38, medium: 52, low: 38 },
    group: 'northwind',
  },
  {
    id: 'bravo',
    name: 'Engagement Bravo',
    score: 8.8,
    verdict: 'Near release',
    verdictNote: 'Strong quality. Close minor items before the next release.',
    weights: { testPass: 88.5, performance: 85, accessibility: 90 },
    tests: { total: 191, passed: 169, failed: 15, blocked: 6, notRun: 1 },
    defects: { critical: 2, high: 7, medium: 2, low: 2 },
    group: 'northwind',
  },
  {
    id: 'charlie',
    name: 'Engagement Charlie',
    score: 9.3,
    verdict: 'Production ready',
    verdictNote: 'Consistent pass rates across two consecutive regression runs.',
    weights: { testPass: 94.1, performance: 92, accessibility: 88 },
    tests: { total: 289, passed: 272, failed: 11, blocked: 4, notRun: 2 },
    defects: { critical: 1, high: 9, medium: 14, low: 11 },
    group: 'northwind',
  },
  {
    id: 'delta',
    name: 'Engagement Delta',
    score: 8.8,
    verdict: 'Near release',
    verdictNote: 'Two high-severity items open against reporting.',
    weights: { testPass: 89.2, performance: 84, accessibility: 86 },
    tests: { total: 157, passed: 140, failed: 12, blocked: 3, notRun: 2 },
    defects: { critical: 0, high: 6, medium: 9, low: 7 },
    group: 'northwind',
  },
  {
    id: 'echo',
    name: 'Engagement Echo',
    score: 4.0,
    verdict: 'Not ready',
    verdictNote: 'Coverage is thin and failures are concentrated in checkout.',
    weights: { testPass: 41.5, performance: 58, accessibility: 44 },
    tests: { total: 82, passed: 34, failed: 39, blocked: 7, notRun: 2 },
    defects: { critical: 6, high: 11, medium: 8, low: 3 },
    group: 'northwind',
  },
  {
    id: 'foxtrot',
    name: 'Enterprise client B, group',
    score: 8.9,
    verdict: 'Near release',
    verdictNote: 'Rolled up across the five products in the group scorecard.',
    weights: { testPass: 90.4, performance: 88, accessibility: 81 },
    tests: { total: 612, passed: 553, failed: 41, blocked: 12, notRun: 6 },
    defects: { critical: 3, high: 9, medium: 6, low: 2 },
    group: 'group',
  },
];

/* ─────────────────────── 7 · defect intelligence board ─────────────────── */

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export type BugStatus = 'Closed' | 'Open';
export type DefectType = 'Bug' | 'Observation' | 'Enhancement';

export interface DefectRow {
  id: string;
  platform: string;
  module: string;
  severity: Severity;
  priority: Priority;
  title: string;
  assignee: string;
  status: BugStatus;
  type: DefectType;
}

/** The original runs on 199 records; see the file header on row counts. */
export const DEFECT_TOTAL = 199;

export const defectRows: DefectRow[] = [
  { id: 'BUG-001', platform: 'Storefront', module: 'Messaging', severity: 'Critical', priority: 'P0', title: 'Bot domain marked as invalid in the messaging channel', assignee: 'Arjun N.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-004', platform: 'Storefront', module: 'Messaging integration', severity: 'Critical', priority: 'P0', title: 'Order tracking accepts only one country’s number format', assignee: 'Arjun N.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-020', platform: 'Storefront', module: 'Track order', severity: 'Critical', priority: 'P0', title: 'Track order returns 404, order not found', assignee: 'Arjun N.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-022', platform: 'Storefront', module: 'Order notification', severity: 'Critical', priority: 'P0', title: 'Contact number format issue in order-management notification', assignee: 'Arjun N.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-033', platform: 'Storefront', module: 'Messaging login', severity: 'Critical', priority: 'P0', title: 'Page stuck on contact sharing during login', assignee: 'Arjun N.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-035', platform: 'Content', module: 'Product upload', severity: 'Critical', priority: 'P0', title: 'File upload API returns 500 internal server error', assignee: 'Rohan M.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-039', platform: 'Content', module: 'Product navigation', severity: 'Critical', priority: 'P0', title: 'Incorrect product opens from the content manager', assignee: 'Rohan M.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-049', platform: 'Order management', module: 'Order sync', severity: 'Critical', priority: 'P0', title: 'Recent orders not reflecting in order management', assignee: 'Arjun N.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-050', platform: 'Order management', module: 'Inventory', severity: 'Critical', priority: 'P0', title: 'Out-of-stock product still purchasable', assignee: 'Arjun N.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-086', platform: 'Returns', module: 'Returns', severity: 'Critical', priority: 'P0', title: 'Document return fails silently', assignee: 'Kabir S.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-019', platform: 'Storefront', module: 'Messaging login', severity: 'Critical', priority: 'P1', title: 'Login performs no action', assignee: 'Arjun N.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-021', platform: 'Storefront', module: 'Track order', severity: 'Critical', priority: 'P1', title: 'Delivered order shown as "In progress"', assignee: 'Arjun N.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-002', platform: 'Storefront', module: 'Messaging', severity: 'High', priority: 'P0', title: 'Bot request chat missing after login', assignee: 'Arjun N.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-003', platform: 'Storefront', module: 'Mobile UI / navigation', severity: 'High', priority: 'P0', title: 'Mobile menu only half scrollable', assignee: 'Arjun N.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-009', platform: 'Storefront', module: 'Chatbot / navigation', severity: 'High', priority: 'P0', title: 'Background redirects to contact page when opening the catalogue', assignee: 'Neha I.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-023', platform: 'Storefront', module: 'Messaging bot', severity: 'High', priority: 'P0', title: 'Bot shows "Delivered" on a freshly placed order', assignee: 'Arjun N.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-026', platform: 'Storefront', module: 'Messaging', severity: 'High', priority: 'P0', title: 'Unclear phone-number detection message', assignee: 'Arjun N.', status: 'Closed', type: 'Observation' },
  { id: 'BUG-029', platform: 'Storefront', module: 'Postal code', severity: 'High', priority: 'P0', title: 'Postal code field accepts alphabetic characters', assignee: 'Arjun N.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-032', platform: 'Storefront', module: 'Inventory', severity: 'High', priority: 'P0', title: 'Out-of-stock product still purchasable from search', assignee: 'Arjun N.', status: 'Closed', type: 'Observation' },
  { id: 'BUG-036', platform: 'Storefront', module: 'Messaging login', severity: 'High', priority: 'P0', title: 'Share-contact page keeps loading after submission', assignee: 'Arjun N.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-037', platform: 'Storefront', module: 'My orders / UI', severity: 'High', priority: 'P0', title: 'My orders page hidden in desktop view', assignee: 'Arjun N.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-038', platform: 'Storefront', module: 'Search / UI', severity: 'High', priority: 'P0', title: 'Product search shows a client-side exception', assignee: 'Arjun N.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-040', platform: 'Content', module: 'Inventory sync', severity: 'High', priority: 'P0', title: 'Uploaded product shows out of stock on the storefront', assignee: 'Arjun N.', status: 'Closed', type: 'Bug' },
  { id: 'BUG-101', platform: 'Weighbridge API', module: 'Ticket capture', severity: 'High', priority: 'P1', title: 'Duplicate ticket accepted when the request is retried', assignee: 'Kabir S.', status: 'Open', type: 'Bug' },
  { id: 'BUG-107', platform: 'Weighbridge API', module: 'Ticket capture', severity: 'High', priority: 'P1', title: 'Tare weight not validated against the vehicle record', assignee: 'Kabir S.', status: 'Open', type: 'Bug' },
  { id: 'BUG-112', platform: 'Returns', module: 'Refund', severity: 'High', priority: 'P1', title: 'Refund amount rounds against the customer', assignee: 'Rohan M.', status: 'Open', type: 'Bug' },
  { id: 'BUG-118', platform: 'Order management', module: 'Dispatch', severity: 'High', priority: 'P1', title: 'Dispatch note prints the previous order’s address', assignee: 'Neha I.', status: 'Open', type: 'Bug' },
  { id: 'BUG-124', platform: 'Partner portal', module: 'Onboarding', severity: 'Medium', priority: 'P1', title: 'Partner onboarding allows an unverified tax id', assignee: 'Sana Q.', status: 'Open', type: 'Bug' },
  { id: 'BUG-131', platform: 'Partner portal', module: 'Reports', severity: 'Medium', priority: 'P2', title: 'Report export omits the last row', assignee: 'Sana Q.', status: 'Open', type: 'Bug' },
  { id: 'BUG-140', platform: 'Content', module: 'Editor', severity: 'Medium', priority: 'P2', title: 'Editor loses formatting on paste', assignee: 'Rohan M.', status: 'Open', type: 'Observation' },
  { id: 'BUG-152', platform: 'Storefront', module: 'Checkout', severity: 'Medium', priority: 'P2', title: 'Coupon field accepts whitespace as a code', assignee: 'Arjun N.', status: 'Open', type: 'Bug' },
  { id: 'BUG-166', platform: 'Storefront', module: 'Account', severity: 'Low', priority: 'P2', title: 'Address book sorts by creation rather than by label', assignee: 'Neha I.', status: 'Open', type: 'Enhancement' },
  { id: 'BUG-171', platform: 'Order management', module: 'Search', severity: 'Low', priority: 'P2', title: 'Order search is case sensitive', assignee: 'Neha I.', status: 'Open', type: 'Enhancement' },
  { id: 'BUG-188', platform: 'Returns', module: 'Notifications', severity: 'Low', priority: 'P2', title: 'Return confirmation email lacks the tracking link', assignee: 'Kabir S.', status: 'Open', type: 'Enhancement' },
];

/* ───────────────────────────── 8 · learning tracker ────────────────────── */

export interface LearnerRow {
  person: Person;
  rating: number;
  verdict: string;
  verdictNote: string;
  functional: number;
  technical: number;
  sessions: { total: number; attended: number };
  effortHrs: number;
  assignments: { done: number; total: number };
  comments: string[];
  useCase: string;
}

export const learners: LearnerRow[] = [
  {
    person: P.kabir,
    rating: 8.0,
    verdict: 'Excellent',
    verdictNote: 'Top-tier contributor with strong functional and technical depth.',
    functional: 9.0,
    technical: 7.0,
    sessions: { total: 14, attended: 10 },
    effortHrs: 22,
    assignments: { done: 6, total: 6 },
    comments: ['Structured documentation', 'Eager to learn and execute'],
    useCase: 'Resource allocation and utilisation tracking workflow',
  },
  {
    person: P.ananya,
    rating: 7.0,
    verdict: 'Good',
    verdictNote: 'Solid grasp of the framework; depth still building on the data model.',
    functional: 7.5,
    technical: 6.5,
    sessions: { total: 14, attended: 12 },
    effortHrs: 26,
    assignments: { done: 6, total: 6 },
    comments: ['Asks precise questions', 'Needs a second pass on permissions'],
    useCase: 'Leave and attendance approval workflow',
  },
  {
    person: P.neha,
    rating: 7.0,
    verdict: 'Good',
    verdictNote: 'Strong on validation; writes the clearest test notes on the team.',
    functional: 8.0,
    technical: 6.0,
    sessions: { total: 14, attended: 13 },
    effortHrs: 24,
    assignments: { done: 6, total: 6 },
    comments: ['Thorough test evidence', 'Comfortable with report builder'],
    useCase: 'Document approval and revision tracking',
  },
  {
    person: P.rohan,
    rating: 8.0,
    verdict: 'Excellent',
    verdictNote: 'Moves quickly from a requirement to a working doctype.',
    functional: 8.0,
    technical: 8.0,
    sessions: { total: 14, attended: 11 },
    effortHrs: 31,
    assignments: { done: 6, total: 6 },
    comments: ['Fast on server scripts', 'Documentation trails the build'],
    useCase: 'Subscription and renewal reminders',
  },
  {
    person: P.sana,
    rating: 7.0,
    verdict: 'Good',
    verdictNote: 'Reliable delivery; still leaning on pairing for the harder scripts.',
    functional: 7.0,
    technical: 7.0,
    sessions: { total: 14, attended: 9 },
    effortHrs: 19,
    assignments: { done: 5, total: 6 },
    comments: ['Consistent attendance', 'One assignment outstanding'],
    useCase: 'Employee feedback collection',
  },
  {
    person: P.arjun,
    rating: 9.0,
    verdict: 'Excellent',
    verdictNote: 'Sets the reference implementation the rest of the group works from.',
    functional: 9.0,
    technical: 9.0,
    sessions: { total: 14, attended: 14 },
    effortHrs: 38,
    assignments: { done: 6, total: 6 },
    comments: ['Reviews others’ work unprompted', 'Strong on permissions model'],
    useCase: 'Credential management and access review',
  },
  {
    person: P.tanvi,
    rating: 7.0,
    verdict: 'Good',
    verdictNote: 'Good functional coverage; technical depth is the next step.',
    functional: 8.0,
    technical: 6.0,
    sessions: { total: 14, attended: 10 },
    effortHrs: 21,
    assignments: { done: 6, total: 6 },
    comments: ['Clear workflow design', 'Limited scripting so far'],
    useCase: 'Onboarding checklist automation',
  },
  {
    person: P.riya,
    rating: 7.0,
    verdict: 'Good',
    verdictNote: 'Business-side depth is the strength here rather than the build.',
    functional: 8.5,
    technical: 5.5,
    sessions: { total: 14, attended: 12 },
    effortHrs: 17,
    assignments: { done: 5, total: 6 },
    comments: ['Excellent acceptance criteria', 'Build work still supervised'],
    useCase: 'Billing and invoice tracking',
  },
  {
    person: P.priya,
    rating: 4.5,
    verdict: 'Needs support',
    verdictNote: 'Attendance and assignment completion are both below the bar.',
    functional: 5.0,
    technical: 4.0,
    sessions: { total: 14, attended: 6 },
    effortHrs: 9,
    assignments: { done: 2, total: 6 },
    comments: ['Missed four consecutive sessions', 'Reassignment discussed'],
    useCase: 'Not yet assigned',
  },
];

/* ──────────────────────── 9 · release readiness report ─────────────────── */

export type QaStatus = 'Closed' | 'Open' | 'Reopened' | 'Invalid';

export interface ReadinessRow {
  id: string;
  summary: string;
  severity: Severity;
  priority: string;
  module: string;
  devStatus: 'Close' | 'Open' | 'Invalid';
  qaStatus: QaStatus;
}

export const readinessRows: ReadinessRow[] = [
  { id: 'RR-001', summary: 'Stored script injection in a listing title executes on page load', severity: 'Critical', priority: 'P0: Immediate', module: 'Listings', devStatus: 'Close', qaStatus: 'Closed' },
  { id: 'RR-002', summary: 'Fee page claims "zero commission" while a platform fee is charged at checkout', severity: 'Critical', priority: 'P0: Immediate', module: 'Checkout', devStatus: 'Close', qaStatus: 'Closed' },
  { id: 'RR-003', summary: 'Tooltip not tappable on mobile and tablet devices', severity: 'Medium', priority: 'High', module: 'UI', devStatus: 'Close', qaStatus: 'Closed' },
  { id: 'RR-004', summary: 'Make-payment button errors after the session goes idle', severity: 'High', priority: 'High', module: 'Checkout', devStatus: 'Open', qaStatus: 'Reopened' },
  { id: 'RR-005', summary: 'No cancel or withdraw option for registered exclusive-event tickets', severity: 'High', priority: 'P0: Immediate', module: 'Exclusive events', devStatus: 'Invalid', qaStatus: 'Invalid' },
  { id: 'RR-006', summary: 'Mandatory verification profile field accepts any value', severity: 'High', priority: 'P0: Immediate', module: 'Exclusive events', devStatus: 'Invalid', qaStatus: 'Invalid' },
  { id: 'RR-007', summary: 'Platform fee recalculated on the confirmation screen only', severity: 'High', priority: 'P0: Immediate', module: 'Checkout', devStatus: 'Open', qaStatus: 'Open' },
  { id: 'RR-008', summary: 'Exclusive-event listing visible to unverified accounts', severity: 'High', priority: 'P0: Immediate', module: 'Exclusive events', devStatus: 'Open', qaStatus: 'Open' },
  { id: 'RR-009', summary: 'Ticket-holder verification email sent twice on retry', severity: 'Medium', priority: 'High', module: 'Exclusive events', devStatus: 'Close', qaStatus: 'Closed' },
  { id: 'RR-010', summary: 'Blog post preview renders raw markup', severity: 'Low', priority: 'P2: Medium', module: 'Blog', devStatus: 'Close', qaStatus: 'Closed' },
  { id: 'RR-011', summary: 'Marketing banner overlaps the search field below 360px', severity: 'Medium', priority: 'P2: Medium', module: 'Marketing content', devStatus: 'Open', qaStatus: 'Open' },
  { id: 'RR-012', summary: 'Listing price accepts a negative value', severity: 'High', priority: 'P0: Immediate', module: 'Listings', devStatus: 'Close', qaStatus: 'Reopened' },
  { id: 'RR-013', summary: 'Seat map does not reflect a released hold for 60 seconds', severity: 'Medium', priority: 'High', module: 'Exclusive events', devStatus: 'Close', qaStatus: 'Closed' },
  { id: 'RR-014', summary: 'Fee breakdown missing from the emailed receipt', severity: 'Medium', priority: 'High', module: 'Checkout', devStatus: 'Open', qaStatus: 'Open' },
  { id: 'RR-015', summary: 'Search returns sold-out listings above available ones', severity: 'Low', priority: 'P2: Medium', module: 'Listings', devStatus: 'Close', qaStatus: 'Closed' },
  { id: 'RR-016', summary: 'Session cookie not cleared on sign-out from a second tab', severity: 'High', priority: 'P0: Immediate', module: 'UI', devStatus: 'Close', qaStatus: 'Reopened' },
];

export const READINESS_TOTAL = 32;
export const readinessFeature = 'Platform fee feature';

/* ─────────────────────────── 10 · OKR dashboard ────────────────────────── */

export type OkrProgressStatus = 'On track' | 'At risk' | 'Off track';
export type OkrApproval =
  | 'Approved'
  | 'Revision requested'
  | 'Pending approval'
  | 'Achievement review';

export interface OkrRow {
  name: string;
  empId: string;
  department: string;
  manager: string;
  set: number;
  achieved: number;
  progress: number;
  status: OkrApproval;
}

export const okrRows: OkrRow[] = [
  { name: 'Ishan Bhatt', empId: 'EMP-00373', department: 'QA', manager: 'Bharat Raghavan', set: 4, achieved: 3, progress: 99.5, status: 'Approved' },
  { name: 'Ritesh Saroj', empId: 'EMP-00405', department: 'Engineering', manager: 'Nikhil Bhosle', set: 3, achieved: 1, progress: 90.0, status: 'Approved' },
  { name: 'Manav Kulkarni', empId: 'EMP-00334', department: 'QA', manager: 'Vikram Joshi', set: 6, achieved: 4, progress: 88.6, status: 'Approved' },
  { name: 'Sagar Singh', empId: 'EMP-00380', department: 'Engineering', manager: 'Nikhil Bhosle', set: 3, achieved: 0, progress: 83.3, status: 'Approved' },
  { name: 'Dhiraj Sahu', empId: 'EMP-00326', department: 'Engineering', manager: 'Amol Bhansali', set: 6, achieved: 2, progress: 80.4, status: 'Approved' },
  { name: 'Sahil Burke', empId: 'EMP-00384', department: 'DevOps', manager: 'Amol Bhansali', set: 8, achieved: 1, progress: 78.5, status: 'Approved' },
  { name: 'Mandar Rathod', empId: 'EMP-00352', department: 'Engineering', manager: 'Nikhil Bhosle', set: 4, achieved: 0, progress: 77.9, status: 'Approved' },
  { name: 'Siraj Panigrahi', empId: 'EMP-00376', department: 'Engineering', manager: 'Vikram Joshi', set: 4, achieved: 1, progress: 75.4, status: 'Approved' },
  { name: 'Yash Pandhare', empId: 'EMP-00383', department: 'Product', manager: 'Amol Bhansali', set: 5, achieved: 1, progress: 73.0, status: 'Approved' },
  { name: 'Parth Bhoir', empId: 'EMP-00409', department: 'DevOps', manager: 'Sahil Burke', set: 4, achieved: 0, progress: 60.0, status: 'Approved' },
  { name: 'Ambrosh Lade', empId: 'EMP-00320', department: 'DevOps', manager: 'Sahil Burke', set: 7, achieved: 0, progress: 60.0, status: 'Approved' },
  { name: 'Hariom Gupta', empId: 'EMP-00283', department: 'DevOps', manager: 'Sahil Burke', set: 3, achieved: 0, progress: 56.7, status: 'Approved' },
  { name: 'Komal Pise', empId: 'EMP-00391', department: 'QA', manager: 'Bharat Raghavan', set: 5, achieved: 1, progress: 52.0, status: 'Approved' },
  { name: 'Sneha Acharya', empId: 'EMP-00366', department: 'QA', manager: 'Bharat Raghavan', set: 4, achieved: 2, progress: 47.0, status: 'Approved' },
  { name: 'Shreya Shetty', empId: 'EMP-00399', department: 'QA', manager: 'Bharat Raghavan', set: 3, achieved: 0, progress: 44.0, status: 'Approved' },
  { name: 'Devika Menon', empId: 'EMP-00344', department: 'Product', manager: 'Amol Bhansali', set: 6, achieved: 1, progress: 38.2, status: 'Revision requested' },
  { name: 'Aarav Pandey', empId: 'EMP-00311', department: 'Engineering', manager: 'Nikhil Bhosle', set: 3, achieved: 0, progress: 0, status: 'Pending approval' },
  { name: 'Kishan Poriya', empId: 'EMP-00358', department: 'Engineering', manager: 'Nikhil Bhosle', set: 4, achieved: 0, progress: 0, status: 'Approved' },
  { name: 'Siya Gupta', empId: 'EMP-00362', department: 'Product', manager: 'Amol Bhansali', set: 4, achieved: 0, progress: 0, status: 'Approved' },
  { name: 'Vraj Shah', empId: 'EMP-00347', department: 'Engineering', manager: 'Nikhil Bhosle', set: 3, achieved: 0, progress: 0, status: 'Achievement review' },
  { name: 'Venkatesh Vallam', empId: 'EMP-00338', department: 'Engineering', manager: 'Nikhil Bhosle', set: 3, achieved: 0, progress: 0, status: 'Approved' },
  { name: 'Leena Fernandes', empId: 'EMP-00301', department: 'HR', manager: 'Amol Bhansali', set: 7, achieved: 1, progress: 62.0, status: 'Approved' },
  { name: 'Rhea Kulkarni', empId: 'EMP-00308', department: 'HR', manager: 'Amol Bhansali', set: 7, achieved: 0, progress: 22.0, status: 'Revision requested' },
  { name: 'Nandan Rao', empId: 'EMP-00295', department: 'Delivery', manager: 'Amol Bhansali', set: 5, achieved: 0, progress: 0, status: 'Pending approval' },
  { name: 'Aditi Verma', empId: 'EMP-00271', department: 'Management', manager: 'n/a', set: 8, achieved: 0, progress: 0, status: 'Pending approval' },
  { name: 'Suhas Patil', empId: 'EMP-00288', department: 'PMO', manager: 'Aditi Verma', set: 6, achieved: 0, progress: 0, status: 'Approved' },
  { name: 'Ira Chandran', empId: 'EMP-00293', department: 'PMO', manager: 'Aditi Verma', set: 5, achieved: 0, progress: 0, status: 'Pending approval' },
];

/**
 * The original's real scale, quoted once in the footer. Everything else the
 * recreation shows is derived from `okrRows`; see the file header.
 */
export const OKR_TOTALS = {
  employees: 108,
  departments: 12,
  set: 501,
} as const;

export const okrPeriod = 'Q2 2026';

// ── Uptime and health monitoring ──────────────────────────────────────────
/**
 * Sanitised recreation of the Uptime Kuma instance.
 *
 * The same rules as the rest of this file, and one that matters more here
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
