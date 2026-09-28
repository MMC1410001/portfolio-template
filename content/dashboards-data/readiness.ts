import type { Severity } from './common';

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
