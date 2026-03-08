/**
 * Unit tests for TeamContext primary-team defaulting behaviour.
 *
 * When a user loads the dashboard:
 *  - If they belong to exactly one team, that team is selected.
 *  - If they belong to multiple teams and one is the default (isDefault === true),
 *    only that team is selected on first load.
 *  - If they belong to multiple teams with no isDefault, the first team
 *    in the returned list is selected on first load.
 *  - If they belong to no teams, selectedTeamIds remains empty.
 *
 * These tests verify the pure helper function that decides which team(s) to
 * pre-select — extracted so it can be tested without React.
 */

import { Team } from '@/types/team';
import { choosePrimaryTeam } from '@/lib/teamSelection';

function makeTeam(id: string, isDefault: boolean = false): Team {
  return {
    id,
    name: `Team ${id}`,
    description: '',
    isDefault,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('choosePrimaryTeam', () => {
  it('returns empty array when teams list is empty', () => {
    expect(choosePrimaryTeam([])).toEqual([]);
  });

  it('returns the single team ID when user has exactly one team', () => {
    const teams = [makeTeam('team-1')];
    expect(choosePrimaryTeam(teams)).toEqual(['team-1']);
  });

  it('returns only the default team ID when one is marked isDefault', () => {
    const teams = [makeTeam('team-1', false), makeTeam('team-2', true), makeTeam('team-3', false)];
    expect(choosePrimaryTeam(teams)).toEqual(['team-2']);
  });

  it('returns first team ID when multiple teams exist but none is default', () => {
    const teams = [makeTeam('team-1', false), makeTeam('team-2', false)];
    expect(choosePrimaryTeam(teams)).toEqual(['team-1']);
  });

  it('returns only the first default team when multiple are marked isDefault', () => {
    // Edge case: DB inconsistency; pick first encountered default
    const teams = [makeTeam('team-1', true), makeTeam('team-2', true)];
    const result = choosePrimaryTeam(teams);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('team-1');
  });

  it('handles team with isDefault === false consistently', () => {
    const teams = [makeTeam('alpha', false)];
    expect(choosePrimaryTeam(teams)).toEqual(['alpha']);
  });
});
