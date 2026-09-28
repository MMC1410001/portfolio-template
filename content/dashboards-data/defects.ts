import type { Priority, Severity } from './common';

/* ─────────────────────── 7 · defect intelligence board ─────────────────── */

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
