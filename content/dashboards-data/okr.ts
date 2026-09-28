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
