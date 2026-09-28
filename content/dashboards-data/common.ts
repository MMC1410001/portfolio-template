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
  vikram: person('Vikram Joshi', 'bg-teal-100 text-teal-700'),
  meera: person('Meera Pillai', 'bg-violet-100 text-violet-700'),
  farhan: person('Farhan Sheikh', 'bg-amber-100 text-amber-700'),
  tanvi: person('Tanvi Desai', 'bg-rose-100 text-rose-700'),
  arjun: person('Arjun Nair', 'bg-sky-100 text-sky-700'),
  rohan: person('Rohan Mehta', 'bg-teal-100 text-teal-700'),
  ananya: person('Ananya Rao', 'bg-orange-100 text-orange-700'),
  kabir: person('Kabir Shah', 'bg-indigo-100 text-indigo-700'),
  neha: person('Neha Iyer', 'bg-emerald-100 text-emerald-700'),
  sana: person('Sana Qureshi', 'bg-fuchsia-100 text-fuchsia-700'),
  priya: person('Priya Menon', 'bg-blue-100 text-blue-700'),
  riya: person('Riya Kapoor', 'bg-cyan-100 text-cyan-700'),
} as const;

export type Priority = 'P0' | 'P1' | 'P2';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
