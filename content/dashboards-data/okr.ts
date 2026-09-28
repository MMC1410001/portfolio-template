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
  { name: 'Samuel Brooks', empId: 'EMP-00373', department: 'QA', manager: 'Richard Hayes', set: 4, achieved: 3, progress: 99.5, status: 'Approved' },
  { name: 'Daniel Foster', empId: 'EMP-00405', department: 'Engineering', manager: 'Matthew Ellis', set: 3, achieved: 1, progress: 90.0, status: 'Approved' },
  { name: 'Ryan Palmer', empId: 'EMP-00334', department: 'QA', manager: 'Oliver Bennett', set: 6, achieved: 4, progress: 88.6, status: 'Approved' },
  { name: 'Luke Chapman', empId: 'EMP-00380', department: 'Engineering', manager: 'Matthew Ellis', set: 3, achieved: 0, progress: 83.3, status: 'Approved' },
  { name: 'Adam Fletcher', empId: 'EMP-00326', department: 'Engineering', manager: 'Andrew Lawson', set: 6, achieved: 2, progress: 80.4, status: 'Approved' },
  { name: 'Nathan Stone', empId: 'EMP-00384', department: 'DevOps', manager: 'Andrew Lawson', set: 8, achieved: 1, progress: 78.5, status: 'Approved' },
  { name: 'Michael Rowe', empId: 'EMP-00352', department: 'Engineering', manager: 'Matthew Ellis', set: 4, achieved: 0, progress: 77.9, status: 'Approved' },
  { name: 'Joseph Kirby', empId: 'EMP-00376', department: 'Engineering', manager: 'Oliver Bennett', set: 4, achieved: 1, progress: 75.4, status: 'Approved' },
  { name: 'Ethan Porter', empId: 'EMP-00383', department: 'Product', manager: 'Andrew Lawson', set: 5, achieved: 1, progress: 73.0, status: 'Approved' },
  { name: 'Owen Barker', empId: 'EMP-00409', department: 'DevOps', manager: 'Nathan Stone', set: 4, achieved: 0, progress: 60.0, status: 'Approved' },
  { name: 'Alfie Lambert', empId: 'EMP-00320', department: 'DevOps', manager: 'Nathan Stone', set: 7, achieved: 0, progress: 60.0, status: 'Approved' },
  { name: 'Henry Grant', empId: 'EMP-00283', department: 'DevOps', manager: 'Nathan Stone', set: 3, achieved: 0, progress: 56.7, status: 'Approved' },
  { name: 'Katie Pearson', empId: 'EMP-00391', department: 'QA', manager: 'Richard Hayes', set: 5, achieved: 1, progress: 52.0, status: 'Approved' },
  { name: 'Sarah Atkins', empId: 'EMP-00366', department: 'QA', manager: 'Richard Hayes', set: 4, achieved: 2, progress: 47.0, status: 'Approved' },
  { name: 'Rebecca Shaw', empId: 'EMP-00399', department: 'QA', manager: 'Richard Hayes', set: 3, achieved: 0, progress: 44.0, status: 'Approved' },
  { name: 'Megan Doyle', empId: 'EMP-00344', department: 'Product', manager: 'Andrew Lawson', set: 6, achieved: 1, progress: 38.2, status: 'Revision requested' },
  { name: 'Aaron Parker', empId: 'EMP-00311', department: 'Engineering', manager: 'Matthew Ellis', set: 3, achieved: 0, progress: 0, status: 'Pending approval' },
  { name: 'Kieran Wells', empId: 'EMP-00358', department: 'Engineering', manager: 'Matthew Ellis', set: 4, achieved: 0, progress: 0, status: 'Approved' },
  { name: 'Isla Graham', empId: 'EMP-00362', department: 'Product', manager: 'Andrew Lawson', set: 4, achieved: 0, progress: 0, status: 'Approved' },
  { name: 'Jacob Webb', empId: 'EMP-00347', department: 'Engineering', manager: 'Matthew Ellis', set: 3, achieved: 0, progress: 0, status: 'Achievement review' },
  { name: 'William Vaughan', empId: 'EMP-00338', department: 'Engineering', manager: 'Matthew Ellis', set: 3, achieved: 0, progress: 0, status: 'Approved' },
  { name: 'Laura Fisher', empId: 'EMP-00301', department: 'HR', manager: 'Andrew Lawson', set: 7, achieved: 1, progress: 62.0, status: 'Approved' },
  { name: 'Rachel Knight', empId: 'EMP-00308', department: 'HR', manager: 'Andrew Lawson', set: 7, achieved: 0, progress: 22.0, status: 'Revision requested' },
  { name: 'Noah Russell', empId: 'EMP-00295', department: 'Delivery', manager: 'Andrew Lawson', set: 5, achieved: 0, progress: 0, status: 'Pending approval' },
  { name: 'Abigail Wood', empId: 'EMP-00271', department: 'Management', manager: 'n/a', set: 8, achieved: 0, progress: 0, status: 'Pending approval' },
  { name: 'Simon Pratt', empId: 'EMP-00288', department: 'PMO', manager: 'Abigail Wood', set: 6, achieved: 0, progress: 0, status: 'Approved' },
  { name: 'Isabel Clarke', empId: 'EMP-00293', department: 'PMO', manager: 'Abigail Wood', set: 5, achieved: 0, progress: 0, status: 'Pending approval' },
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
