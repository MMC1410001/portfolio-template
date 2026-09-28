import { ROSTER, type Person } from './common';

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
