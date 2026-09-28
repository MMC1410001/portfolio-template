import { ROSTER, type Person } from './common';

const P = ROSTER;

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
  { sr: '1', task: 'Requirement and scope document with end-to-end flow diagrams from business users', hrs: 18, tentative: ['11 May 2026', '12 May 2026'], owner: P.hannah, actual: ['11 May 2026', '18 May 2026'], status: 'Completed', comment: 'Further changes were suggested on the BRD; sign-off received on 18 May.' },
  { sr: '2', task: 'Modifying codebase to match existing platform functionality', hrs: 45, tentative: ['13 May 2026', '25 May 2026'], owner: P.emily, actual: ['12 May 2026', '19 May 2026'], status: 'Completed', comment: null },
  { sr: '2.1', task: 'Repository setup', hrs: 1, tentative: ['12 May 2026', '12 May 2026'], owner: P.thomas, actual: ['12 May 2026', '12 May 2026'], status: 'Completed', comment: null },
  { sr: '2.2', task: 'Existing project setup', hrs: 2, tentative: ['12 May 2026', '12 May 2026'], owner: P.emily, actual: ['12 May 2026', '12 May 2026'], status: 'Completed', comment: null },
  { sr: '2.3', task: 'Understanding the existing project', hrs: 12, tentative: ['12 May 2026', '13 May 2026'], owner: P.jack, actual: ['12 May 2026', '13 May 2026'], status: 'Completed', comment: 'Walkthrough taken from both the HR and Finance teams.' },
  { sr: '2.4', task: 'Coding the new functionality', hrs: 20, tentative: ['13 May 2026', '18 May 2026'], owner: P.jack, actual: ['14 May 2026', '18 May 2026'], status: 'Completed', comment: null },
  { sr: '2.5', task: 'Integrating the new functionality with the existing code', hrs: 10, tentative: ['19 May 2026', '20 May 2026'], owner: P.thomas, actual: ['19 May 2026', '19 May 2026'], status: 'Completed', comment: null },
  { sr: '3', task: 'Code review', hrs: 2.5, tentative: ['20 May 2026', '20 May 2026'], owner: P.oliver, actual: ['20 May 2026', '20 May 2026'], status: 'Completed', comment: null },
  { sr: '4', task: 'Merging the new functionality into the existing codebase', hrs: 1, tentative: ['20 May 2026', '20 May 2026'], owner: P.oliver, actual: ['20 May 2026', '20 May 2026'], status: 'Completed', comment: null },
  { sr: '6', task: 'Developer sanity on the local environment', hrs: 1, tentative: ['21 May 2026', '21 May 2026'], owner: P.jack, actual: ['21 May 2026', '21 May 2026'], status: 'Completed', comment: null },
  { sr: '7', task: 'Deployment to UAT', hrs: 0.5, tentative: ['21 May 2026', '21 May 2026'], owner: P.oliver, actual: ['21 May 2026', '21 May 2026'], status: 'Completed', comment: null },
  { sr: '8', task: 'User guide creation', hrs: 4, tentative: ['21 May 2026', '22 May 2026'], owner: P.grace, actual: ['22 May 2026', '22 May 2026'], status: 'Completed', comment: null },
  { sr: '9', task: 'QA testing on UAT', hrs: 15, tentative: ['22 May 2026', '26 May 2026'], owner: P.grace, actual: ['22 May 2026', null], status: 'In Progress', comment: 'Payroll variance cases still to run.' },
  { sr: '10', task: 'User testing on UAT: Finance team', hrs: 12, tentative: ['23 May 2026', '27 May 2026'], owner: P.lucy, actual: ['24 May 2026', null], status: 'In Progress', comment: null },
  { sr: '11', task: 'User testing on UAT: HR team', hrs: 8, tentative: ['23 May 2026', '27 May 2026'], owner: P.hannah, actual: null, status: 'To be picked up', comment: null },
  { sr: '12', task: 'Production deployment and hypercare', hrs: 3, tentative: ['28 May 2026', '29 May 2026'], owner: P.oliver, actual: null, status: 'To be picked up', comment: null },
];

export const actionPlanMembers = [
  { person: P.grace, role: 'User guide creation · QA testing on UAT', hrs: 19, done: 2, owner: false },
  { person: P.lucy, role: 'User testing on UAT: Finance team', hrs: 12, done: 1, owner: false },
  { person: P.hannah, role: 'User testing on UAT: HR team', hrs: 8, done: 1, owner: false },
  { person: P.oliver, role: 'Project owner', hrs: 6, done: 3, owner: true },
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
