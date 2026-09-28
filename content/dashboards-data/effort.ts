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
  { name: 'Harry C.', byMonth: [174, 152, 121, 52, 58, 30] },
  { name: 'Jack M.', byMonth: [null, null, null, 54, 101, 134] },
  { name: 'Grace H.', byMonth: [null, null, null, 65, 40, 90] },
  { name: 'Thomas R.', byMonth: [null, null, 34, 36, 52, 71] },
  { name: 'Sophie M.', byMonth: [null, null, null, 4, 52, 34] },
  { name: 'Emily C.', byMonth: [null, null, null, null, 42, 26] },
  { name: 'Chloe T.', byMonth: [null, null, null, 21, 19, 12] },
  { name: 'Lucy W.', byMonth: [null, null, null, 4, 12, 4] },
];

export const effortKickoff = '01 Nov 2025';

export const effortPo = {
  issued: 3,
  pending: 3,
  paymentReceived: 2,
  invoiceSent: 1,
  paymentPending: 3,
};
