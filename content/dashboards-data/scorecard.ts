/* ──────────────────────────── 4 · quality scorecard ────────────────────── */

export interface ScorecardProduct {
  id: string;
  name: string;
  score: number;
  ready: boolean;
  /** Movement since the previous report. */
  delta: number;
  headline: string;
  summary: string;
  breakdown: { reliability: number; speed: number; inclusive: number };
  defects: {
    closed: number;
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  risk: string;
  automation: number;
}

export const scorecardProducts: ScorecardProduct[] = [
  {
    id: 'dealer-api',
    name: 'Partner data API',
    score: 100,
    ready: true,
    delta: 20,
    headline: 'APIs are in production and there are no open issues.',
    summary:
      'Tested across 200+ scenarios covering multiple areas, with a 100% pass rate. Every issue found during testing has been fixed and verified. The system stayed stable under peak usage with no crashes or slowdowns, and is performing reliably for real-world demand.',
    breakdown: { reliability: 100, speed: 100, inclusive: 100 },
    defects: { closed: 18, total: 18, critical: 0, high: 0, medium: 0, low: 0 },
    risk: 'Data-heavy endpoints such as product search slow down under high user load and may affect response times during peak usage.',
    automation: 100,
  },
  {
    id: 'field-assistant',
    name: 'Field sales assistant',
    score: 99,
    ready: true,
    delta: 8,
    headline: 'On production.',
    summary:
      'All critical journeys pass end to end. One cosmetic defect remains open against the summary screen and is scheduled for the next patch.',
    breakdown: { reliability: 99, speed: 98, inclusive: 96 },
    defects: { closed: 41, total: 42, critical: 0, high: 0, medium: 0, low: 1 },
    risk: 'Offline sync has only been exercised on the two handset models the field team currently carries.',
    automation: 86,
  },
  {
    id: 'product-chatbot',
    name: 'Product chatbot',
    score: 95,
    ready: true,
    delta: 20.3,
    headline:
      'Answers product questions reliably, and its performance is consistent.',
    summary:
      'Response quality was scored against a fixed question set across product, pricing and availability. Accuracy held above the agreed threshold on every rerun.',
    breakdown: { reliability: 96, speed: 94, inclusive: 90 },
    defects: { closed: 27, total: 29, critical: 0, high: 1, medium: 1, low: 0 },
    risk: 'Long multi-turn conversations occasionally lose earlier context and restate an answer already given.',
    automation: 74,
  },
  {
    id: 'letter-generation',
    name: 'Scheme letter generation',
    score: 78,
    ready: false,
    delta: -1.5,
    headline: 'Delivery currently targets a demo pilot release only.',
    summary:
      'The generation path works for the templates in scope. Coverage outside those templates is untested, and the pilot scope is deliberately narrow.',
    breakdown: { reliability: 82, speed: 76, inclusive: 62 },
    defects: { closed: 9, total: 16, critical: 1, high: 3, medium: 2, low: 1 },
    risk: 'Template variants outside the pilot set have not been exercised at all; a wider release would be testing in production.',
    automation: 31,
  },
  {
    id: 'custom-dev',
    name: 'Custom scheme development',
    score: 75,
    ready: false,
    delta: 10.4,
    headline: 'Coding errors surface instead of proper error messages.',
    summary:
      'Functional coverage is improving, but failure handling is not presentable: unhandled exceptions reach the user in place of a message describing what went wrong.',
    breakdown: { reliability: 78, speed: 80, inclusive: 55 },
    defects: { closed: 14, total: 25, critical: 2, high: 5, medium: 3, low: 1 },
    risk: 'Error states are unhandled across several flows; a user hitting one has no way to recover without support.',
    automation: 24,
  },
];
