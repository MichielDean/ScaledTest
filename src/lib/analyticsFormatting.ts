/**
 * Formatting utilities for analytics and test result display.
 *
 * Centralises pass rate colour/variant logic so components stay consistent
 * and thresholds only live in one place.
 */

/**
 * Returns a Tailwind text-colour class based on a pass rate percentage.
 *
 * ≥ 80 % → text-primary (healthy)
 * ≥ 60 % → text-muted-foreground (warning)
 *  < 60 % → text-destructive (critical)
 */
export const getPassRateColor = (rate: number): string => {
  if (rate >= 80) return 'text-primary';
  if (rate >= 60) return 'text-muted-foreground';
  return 'text-destructive';
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
