/**
 * Formatting utilities for analytics and test result display.
 *
 * Centralises pass rate colour/variant logic so components stay consistent
 * and thresholds only live in one place.
 */

/**
 * Returns a Tailwind text-colour class based on a pass rate percentage.
 *
 * ≥ 80 % → green (healthy)
 * ≥ 60 % → yellow (warning)
 *  < 60 % → red (critical)
 */
export const getPassRateColor = (rate: number): string => {
  if (rate >= 80) return 'text-green-700';
  if (rate >= 60) return 'text-yellow-700';
  return 'text-red-600';
};

/**
 * Returns a shadcn Badge variant based on a pass rate percentage.
 *
 * ≥ 80 % → default  (green)
 * ≥ 60 % → secondary (neutral)
 *  < 60 % → destructive (red)
 */
export const getPassRateVariant = (
  rate: number
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (rate >= 80) return 'default';
  if (rate >= 60) return 'secondary';
  return 'destructive';
};
