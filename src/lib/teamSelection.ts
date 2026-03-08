/**
 * teamSelection.ts
 *
 * Pure helper functions for choosing which team(s) to show by default
 * when a user first loads the dashboard.
 *
 * Rules (in priority order):
 *  1. If the user has no teams → return [].
 *  2. If exactly one team → return [that team's id].
 *  3. If one team is marked isDefault → return [that team's id].
 *  4. If multiple teams, none is default → return [first team's id].
 *  5. If multiple defaults (DB inconsistency) → return [first default's id].
 */

import { Team } from '../types/team';

/**
 * Decide which single team should be pre-selected when the user lands on
 * the dashboard for the first time (i.e. when no prior selection exists).
 *
 * Returns an array with one element (the chosen team's id), or an empty
 * array when the user has no teams.
 */
export function choosePrimaryTeam(teams: Team[]): string[] {
  if (teams.length === 0) {
    return [];
  }

  if (teams.length === 1) {
    return [teams[0].id];
  }

  // Prefer the team explicitly marked as default
  const defaultTeam = teams.find(t => t.isDefault);
  if (defaultTeam) {
    return [defaultTeam.id];
  }

  // No default flag set — fall back to the first team in the list
  return [teams[0].id];
}
