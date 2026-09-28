import { ROSTER, type Person, type Priority } from './common';

const P = ROSTER;

/* ───────────────────────────── 3 · release plan ────────────────────────── */

export type ReleaseStage =
  | 'Live'
  | 'UAT'
  | 'Development'
  | 'Design'
  | 'To Be Picked'
  | 'Deferred';


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
  { n: 1, feature: 'Retirement calculator', priority: 'P0', workType: 'Enhancement', stage: 'UAT', project: 'Web', pm: P.amelia, em: P.harry, goLive: 'Jun 10' },
  { n: 2, feature: 'Blog homepage: design change', priority: 'P1', workType: 'Enhancement', stage: 'Development', project: 'Web', pm: P.amelia, em: P.harry, goLive: 'Jun 19' },
  { n: 3, feature: 'Money-basics page revamp', priority: 'P1', workType: 'Enhancement', stage: 'Live', project: 'Web', pm: P.amelia, em: P.harry, goLive: 'Jun 04' },
  { n: 4, feature: 'Conclave post-event page', priority: 'P1', workType: 'Enhancement', stage: 'Design', project: 'Web', pm: P.amelia, em: P.harry, goLive: 'Jun 19' },
  { n: 5, feature: 'Advisory landing page', priority: 'P2', workType: 'Strategic Initiative', stage: 'To Be Picked', project: 'Web', pm: P.amelia, em: P.harry, goLive: 'Jun 29' },
  { n: 6, feature: 'Onboarding journey: step 2 rework', priority: 'P0', workType: 'New Build', stage: 'Development', project: 'Core platform', pm: P.chloe, em: P.thomas, goLive: 'Jun 22' },
  { n: 7, feature: 'Document vault: bulk upload', priority: 'P1', workType: 'New Build', stage: 'Development', project: 'Core platform', pm: P.chloe, em: P.thomas, goLive: 'Jun 25' },
  { n: 8, feature: 'Portfolio summary export', priority: 'P2', workType: 'Enhancement', stage: 'To Be Picked', project: 'Core platform', pm: P.chloe, em: P.thomas, goLive: 'Jun 30' },
  { n: 9, feature: 'Session timeout handling', priority: 'P0', workType: 'Defect Fix', stage: 'UAT', project: 'Core platform', pm: P.chloe, em: P.jack, goLive: 'Jun 12' },
  { n: 10, feature: 'Consent capture rewrite', priority: 'P0', workType: 'Strategic Initiative', stage: 'Design', project: 'Compliance', pm: P.george, em: P.jack, goLive: 'Jun 27' },
  { n: 11, feature: 'Audit trail retention', priority: 'P1', workType: 'Enhancement', stage: 'Development', project: 'Compliance', pm: P.george, em: P.jack, goLive: 'Jun 24' },
  { n: 12, feature: 'Access review report', priority: 'P2', workType: 'Enhancement', stage: 'Deferred', project: 'Compliance', pm: P.george, em: P.jack, goLive: 'Jul 08' },
  { n: 13, feature: 'Payment retry logic', priority: 'P0', workType: 'Defect Fix', stage: 'Live', project: 'Payments', pm: P.oliver, em: P.emily, goLive: 'Jun 06' },
  { n: 14, feature: 'Refund status webhook', priority: 'P1', workType: 'New Build', stage: 'UAT', project: 'Payments', pm: P.oliver, em: P.emily, goLive: 'Jun 17' },
  { n: 15, feature: 'Statement download throttle', priority: 'P2', workType: 'Enhancement', stage: 'To Be Picked', project: 'Payments', pm: P.oliver, em: P.emily, goLive: 'Jun 30' },
  { n: 16, feature: 'Advisor search relevance', priority: 'P1', workType: 'Enhancement', stage: 'Development', project: 'Discovery', pm: P.amelia, em: P.thomas, goLive: 'Jun 20' },
  { n: 17, feature: 'Recommendation surface: v2', priority: 'P0', workType: 'Strategic Initiative', stage: 'Design', project: 'Discovery', pm: P.amelia, em: P.thomas, goLive: 'Jun 28' },
  { n: 18, feature: 'Notification preferences', priority: 'P2', workType: 'Enhancement', stage: 'Live', project: 'Discovery', pm: P.amelia, em: P.thomas, goLive: 'Jun 02' },
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
