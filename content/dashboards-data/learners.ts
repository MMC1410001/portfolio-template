import { ROSTER, type Person } from './common';

const P = ROSTER;

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
    person: P.thomas,
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
    person: P.emily,
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
    person: P.grace,
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
    person: P.jack,
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
    person: P.sophie,
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
    person: P.harry,
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
    person: P.chloe,
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
    person: P.lucy,
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
    person: P.hannah,
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
