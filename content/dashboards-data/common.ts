/**
 * Shared by several recreations: the invented roster and the two status
 * vocabularies more than one board uses. See content/dashboards-demo.ts for
 * why every name is invented and why the roster is shared.
 */

export interface Person {
  name: string;
  initials: string;
  /** Tailwind classes for the avatar chip. Assigned per person, stable. */
  tone: string;
}

const person = (name: string, tone: string): Person => ({
  name,
  initials: name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase(),
  tone,
});

export const ROSTER = {
  oliver: person('Oliver Bennett', 'bg-teal-100 text-teal-700'),
  amelia: person('Amelia Hughes', 'bg-violet-100 text-violet-700'),
  george: person('George Whitaker', 'bg-amber-100 text-amber-700'),
  chloe: person('Chloe Turner', 'bg-rose-100 text-rose-700'),
  harry: person('Harry Collins', 'bg-sky-100 text-sky-700'),
  jack: person('Jack Morrison', 'bg-teal-100 text-teal-700'),
  emily: person('Emily Carter', 'bg-orange-100 text-orange-700'),
  thomas: person('Thomas Reed', 'bg-indigo-100 text-indigo-700'),
  grace: person('Grace Holloway', 'bg-emerald-100 text-emerald-700'),
  sophie: person('Sophie Marsh', 'bg-fuchsia-100 text-fuchsia-700'),
  hannah: person('Hannah Price', 'bg-blue-100 text-blue-700'),
  lucy: person('Lucy Warren', 'bg-cyan-100 text-cyan-700'),
} as const;

export type Priority = 'P0' | 'P1' | 'P2';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
