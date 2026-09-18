/**
 * The operational dashboards Alex built at Northwind, for `/dashboards`.
 *
 * ── Everything here is sanitised, and that is not a style choice ───────────
 * Nine of the ten originals are Google Apps Script web apps deployed under the
 * `northwind.example` Workspace domain, backed by Google Sheets; the tenth is a page
 * inside the Northwind ERP. Two consequences shape this file:
 *
 *  - **No URLs, ever.** An Apps Script `/macros/northwind.example/s/<id>/exec` link
 *    and a `docs.google.com/spreadsheets/d/<id>` link are internal URLs
 *    carrying a deployment id and a spreadsheet id. They are also useless to a
 *    visitor: fetched anonymously, every one of them returns a Google account
 *    chooser, not a dashboard. Publishing them would leak internal identifiers
 *    in exchange for ten dead links.
 *  - **No client names.** `client` is a positional label, "Enterprise client
 *    A", assigned here and nowhere else. The sector is omitted too, because
 *    naming the industry of a dashboard titled "effort utilisation and
 *    approval" re-identifies the client to anyone who knows the market.
 *
 * `#work` in content/portfolio.ts does name two of these clients, because that
 * section describes engagements Alex was publicly part of. This file makes no
 * such claim and stays anonymous, uniformly, including for the two that are
 * already public, because a page that names some clients and not others invites
 * the reader to work out which anonymous one is which.
 *
 * The same letter means the same client across entries: B commissioned both the
 * quality scorecard and the effort report, and that pairing is itself part of
 * what the page shows.
 *
 * ── `purpose` is the reason it exists, not the thing it shows ─────────────
 * "Tracks defect ageing" is a description; "defect status lived in three chat
 * threads and nobody could answer 'what is open' without asking" is a reason.
 * The second is the one worth publishing, and it is the one only Alex can
 * supply, which is why `purpose` is a required field rather than an optional
 * one. An entry cannot be added half-finished.
 */

export type DashboardStatus = 'active' | 'retired';

export interface Dashboard {
  id: string;
  /** Sanitised title. Never the internal sheet or deployment name. */
  name: string;
  /** Short label for the picker, where the full name does not fit. */
  short: string;
  /**
   * One line for the card. Deliberately a field rather than the first
   * sentence of `purpose`: a card is read in two seconds and `purpose` opens
   * by describing the problem, which makes a poor opening clause when it is
   * cut off mid-thought.
   */
  tagline: string;
  /**
   * The original's real headline volume, for the card. This is the one place
   * the true figure is quoted outside a footer, and it is safe because a
   * count is not a client: "199 defects" identifies nobody.
   */
  metric: string;
  /** Positional label, or null for dashboards with no external client. */
  client: string | null;
  /** Why it was built, the problem, not the feature list. */
  purpose: string;
  /** What it puts on screen, in the recreation's own terms. */
  shows: string;
  stack: string[];
  status: DashboardStatus;
}

/**
 * Verified from the source workbook: nine of the ten entries are Apps Script
 * web apps whose datastore is a Google Sheet, served through HTML Service and
 * gated by Workspace sign-in. Anything beyond that, charting library, trigger
 * schedule, is per-dashboard and belongs in `stack` only once confirmed. The
 * OKR dashboard is the exception and carries its own stack entirely; it is a
 * page inside the ERP, not a script deployment.
 */
export const DASHBOARD_BASE_STACK = [
  'Google Apps Script',
  'Google Sheets',
  'HTML Service',
  'Workspace SSO',
] as const;

export const dashboards: Dashboard[] = [
  {
    id: 'automation-portfolio',
    name: 'Automation delivery board',
    short: 'Delivery board',
    tagline: 'Every internal automation project, and who is carrying it.',
    metric: '15 projects',
    client: null,
    purpose:
      'Delivery status for every internal automation project lived in a spreadsheet that only its owner opened. Nobody outside a project could answer "what is in UAT" or "who is carrying five of these" without asking, so the answer was always a day late and usually wrong.',
    shows:
      'Every project in one board: pipeline counts across BRD, development, UAT and live; the split by department; how the work is distributed across owners; and a searchable, sortable table down to the dev, QA and business people assigned to each project.',
    stack: [...DASHBOARD_BASE_STACK, 'Time-driven triggers'],
    status: 'active',
  },
  {
    id: 'payroll-action-plan',
    name: 'Payroll rollout action plan',
    short: 'Action plan',
    tagline: 'One rollout, estimate against actual, task by task.',
    metric: '16 tasks · 153 hrs',
    client: null,
    purpose:
      'A payroll build touches HR and Finance at once, and both wanted to know the same thing on different days: is it going to land on the date we were given. A task list in a sheet answered that only for whoever had just read it, so the status meeting kept re-deriving it.',
    shows:
      'One rollout as a plan rather than a backlog: the phase it has reached, the estimate against the actual on every task including sub-tasks, who owns each one, effort by owner, and the banner that tells business users the guide has been shared and where the build now is.',
    stack: [...DASHBOARD_BASE_STACK, 'Time-driven triggers'],
    status: 'retired',
  },
  {
    id: 'release-plan',
    name: 'Programme release plan',
    short: 'Release plan',
    tagline: 'A month of deliverables, next to the process the plan assumes.',
    metric: '49 deliverables',
    client: 'Enterprise client A',
    purpose:
      'A month of delivery ran across product, engineering and security with no shared view of what was committed. Prioritisation arguments were really arguments about the list, because each function held a different one.',
    shows:
      'The month\'s deliverables as a single plan: counts by stage, a filterable table down to feature, priority, work type, PM and go-live date: and, alongside it, the delivery hierarchy, the lifecycle and the sprint ceremonies the plan assumes, so a newcomer can read the process and the plan in one place.',
    stack: [...DASHBOARD_BASE_STACK, 'Client-side routing'],
    status: 'active',
  },
  {
    id: 'quality-scorecard',
    name: 'Release quality scorecard',
    short: 'Quality scorecard',
    tagline: 'One score per product, computed the same way every time.',
    metric: '5 products',
    client: 'Enterprise client B',
    purpose:
      'The client asked "is it ready" about five products at once and got five differently-shaped answers, each from a different QA conversation. A single number per product, computed the same way every time, ends that, and makes the disagreement about the score rather than about the question.',
    shows:
      'A card per product carrying a score out of 100, a ready or not-ready verdict, and the movement since last time; expanded, the reliability, speed and inclusivity components behind the score, defect closure by severity, the named risks, and automation coverage.',
    stack: [...DASHBOARD_BASE_STACK, 'Weighted scoring model'],
    status: 'active',
  },
  {
    id: 'effort-approval',
    name: 'Effort utilisation and approval report',
    short: 'Effort report',
    tagline: 'Six months of hours: logged, approved, invoiced.',
    metric: '2,378 hrs',
    client: 'Enterprise client B',
    purpose:
      'Hours were logged monthly, approved in batches and invoiced against purchase orders, and the three lived in different places. The recurring question was not how many hours had been spent but how many had been approved, and nothing on hand answered it per project.',
    shows:
      'Six months of logged effort five ways: an overall summary with the approved, rejected and pending split; the month-by-month curve; per-project approval status; a resource-by-month grid shaded by load; and the purchase-order and payment state for each project.',
    stack: [...DASHBOARD_BASE_STACK, 'Time-driven triggers'],
    status: 'retired',
  },
  {
    id: 'portfolio-quality',
    name: 'Delivery-wide quality dashboard',
    short: 'Quality (all clients)',
    tagline: 'Every engagement\'s quality score on one rail.',
    metric: '6 engagements',
    client: null,
    purpose:
      'Every engagement reported its own quality its own way, so nobody could see across them. Which account is about to ship something unsafe is a question about the whole portfolio, and no per-project report can answer it.',
    shows:
      'One rail listing every engagement with its current score, and for the selected one: the weighted quality score and its inputs, test-case pass and fail rates, defect classification by severity, and the jump into that engagement\'s test cases and bug list.',
    stack: [...DASHBOARD_BASE_STACK, 'Weighted scoring model'],
    status: 'active',
  },
  {
    id: 'defect-intelligence',
    name: 'Defect intelligence board',
    short: 'Defect board',
    tagline: 'Two hundred defects, read as a release position.',
    metric: '199 defects',
    client: 'Enterprise client C',
    purpose:
      'Two hundred defects across six platforms had accumulated in a sheet nobody could read as a whole. "Are we safe to release" was being answered from whichever rows happened to be on screen, and the honest answer depended on severity and platform at once.',
    shows:
      'The defect log as a report: KPI tiles for open, closed, critical and closure rate; severity, priority, assignee, platform and defect-type breakdowns; a risk assessment that states the release position and why; and the full, filterable, paginated bug list behind all of it.',
    stack: [...DASHBOARD_BASE_STACK, 'Chart rendering', 'Emailed reports'],
    status: 'active',
  },
  {
    id: 'learning-tracker',
    name: 'Capability and learning tracker',
    short: 'Learning tracker',
    tagline: 'Who is actually ready to be given work on this.',
    metric: '9 members',
    client: null,
    purpose:
      'A team was being brought onto an unfamiliar framework on a deadline, and attendance told you nothing about whether it was working. Who was actually ready to be given work on it was a judgement being made from memory.',
    shows:
      'A rail of everyone on the programme with their current rating, and for the selected person: the functional and technical scores behind that rating, session attendance against sessions held, assignment completion, effort logged, and the written assessment.',
    stack: [...DASHBOARD_BASE_STACK, 'Weighted scoring model'],
    status: 'retired',
  },
  {
    id: 'release-readiness',
    name: 'Release readiness bug report',
    short: 'Release readiness',
    tagline: 'A go / no-go call, with the rule that produced it.',
    metric: '32 bugs',
    client: 'Enterprise client D',
    purpose:
      'A go or no-go call on a payments-adjacent feature was being made in a meeting, from a bug list, by whoever had read it most recently. The call itself is the deliverable, so the dashboard states it, and states the condition attached to it.',
    shows:
      'A go / conditional-go / no-go verdict at the top, with the rule that produced it written underneath; counts by severity, priority and QA status including reopened regressions; breakdowns by module; and the bug records the verdict was computed from.',
    stack: [...DASHBOARD_BASE_STACK, 'Chart rendering', 'Go / no-go rule engine'],
    status: 'active',
  },
  {
    id: 'okr-dashboard',
    name: 'Organisation OKR dashboard',
    short: 'OKR dashboard',
    tagline: 'A hundred-plus people\'s objectives, as one quarter.',
    metric: '108 employees',
    client: null,
    purpose:
      'OKRs were set per employee and reviewed per manager, which meant the organisation-level questions (how many people have actually submitted, which departments are behind, who has had no manager review) could only be answered by opening every record. At a hundred-plus employees that stopped being possible.',
    shows:
      'The quarter for the whole organisation: submission and achievement rates, average progress and its status distribution, department averages flagged on track, at risk or off track, top and lowest performers, and a searchable employee table with manager, targets set, achieved and latest review.',
    stack: [
      'Frappe / ERPNext',
      'Python',
      'MariaDB',
      'Jinja + JS page',
      'Role-based permissions',
    ],
    status: 'active',
  },
];
