/* ──────────────────────── 6 · delivery-wide quality ────────────────────── */

export interface QualityEngagement {
  id: string;
  name: string;
  /** Out of 10, as the original shows it. */
  score: number;
  verdict: string;
  verdictNote: string;
  weights: { testPass: number; performance: number; accessibility: number };
  tests: {
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    notRun: number;
  };
  defects: { critical: number; high: number; medium: number; low: number };
  group: 'northwind' | 'group';
}

export const qualityEngagements: QualityEngagement[] = [
  {
    id: 'alpha',
    name: 'Engagement Alpha',
    score: 9.9,
    verdict: 'Production ready',
    verdictNote: 'Excellent quality across all tested modules. Safe to release.',
    weights: { testPass: 99.3, performance: 95, accessibility: 95 },
    tests: { total: 440, passed: 437, failed: 3, blocked: 0, notRun: 0 },
    defects: { critical: 14, high: 38, medium: 52, low: 38 },
    group: 'northwind',
  },
  {
    id: 'bravo',
    name: 'Engagement Bravo',
    score: 8.8,
    verdict: 'Near release',
    verdictNote: 'Strong quality. Close minor items before the next release.',
    weights: { testPass: 88.5, performance: 85, accessibility: 90 },
    tests: { total: 191, passed: 169, failed: 15, blocked: 6, notRun: 1 },
    defects: { critical: 2, high: 7, medium: 2, low: 2 },
    group: 'northwind',
  },
  {
    id: 'charlie',
    name: 'Engagement Charlie',
    score: 9.3,
    verdict: 'Production ready',
    verdictNote: 'Consistent pass rates across two consecutive regression runs.',
    weights: { testPass: 94.1, performance: 92, accessibility: 88 },
    tests: { total: 289, passed: 272, failed: 11, blocked: 4, notRun: 2 },
    defects: { critical: 1, high: 9, medium: 14, low: 11 },
    group: 'northwind',
  },
  {
    id: 'delta',
    name: 'Engagement Delta',
    score: 8.8,
    verdict: 'Near release',
    verdictNote: 'Two high-severity items open against reporting.',
    weights: { testPass: 89.2, performance: 84, accessibility: 86 },
    tests: { total: 157, passed: 140, failed: 12, blocked: 3, notRun: 2 },
    defects: { critical: 0, high: 6, medium: 9, low: 7 },
    group: 'northwind',
  },
  {
    id: 'echo',
    name: 'Engagement Echo',
    score: 4.0,
    verdict: 'Not ready',
    verdictNote: 'Coverage is thin and failures are concentrated in checkout.',
    weights: { testPass: 41.5, performance: 58, accessibility: 44 },
    tests: { total: 82, passed: 34, failed: 39, blocked: 7, notRun: 2 },
    defects: { critical: 6, high: 11, medium: 8, low: 3 },
    group: 'northwind',
  },
  {
    id: 'foxtrot',
    name: 'Enterprise client B, group',
    score: 8.9,
    verdict: 'Near release',
    verdictNote: 'Rolled up across the five products in the group scorecard.',
    weights: { testPass: 90.4, performance: 88, accessibility: 81 },
    tests: { total: 612, passed: 553, failed: 41, blocked: 12, notRun: 6 },
    defects: { critical: 3, high: 9, medium: 6, low: 2 },
    group: 'group',
  },
];
