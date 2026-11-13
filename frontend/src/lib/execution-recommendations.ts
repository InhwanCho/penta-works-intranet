// Preselect only one unambiguous candidate. The user still explicitly confirms it.
export function uniqueRecommendation<T extends { id: number; recommended: boolean; reversal: boolean }>(
  plan: { id: number; recommendations: T[] },
  plans: { id: number; recommendations: T[] }[],
): T | undefined {
  const candidates = plan.recommendations.filter(c => c.recommended && !c.reversal);
  if (candidates.length !== 1) return undefined;
  const candidate = candidates[0];
  return plans.some(p => p.id !== plan.id && p.recommendations.some(c => c.id === candidate.id && !c.reversal)) ? undefined : candidate;
}
