/**
 * Team-based access control filter utilities
 * Provides shared logic for building OpenSearch queries that respect team boundaries
 */

/**
 * Default team for users with no team assignments - used for demo data access
 */
export const DEMO_DATA_TEAM = 'demo-data';

/**
 * Builds OpenSearch filters for team-based access control
 *
 * This function creates a filter that allows users to see:
 * 1. Reports from their assigned teams
 * 2. Reports they uploaded themselves
 * 3. Demo data (marked with isDemoData=true or demo-data team)
 *
 * @param userId - The user's unique identifier
 * @param userTeamIds - Array of team IDs the user belongs to
 * @returns OpenSearch filter object that can be used in bool queries
 */
export function buildTeamAccessFilter(
  userId: string,
  userTeamIds: string[]
): Record<string, unknown> {
  const shouldClauses = [];

  // If user has teams, they can access reports for those teams
  if (userTeamIds.length > 0) {
    shouldClauses.push({
      terms: {
        'metadata.userTeams.keyword': userTeamIds,
      },
    });
  }

  // User can always access their own uploads
  shouldClauses.push({
    term: {
      'metadata.uploadedBy.keyword': userId,
    },
  });

  // All users can access demo data
  shouldClauses.push({
    term: {
      'metadata.isDemoData': true,
    },
  });

  // All users can access data marked with demo-data team
  shouldClauses.push({
    term: {
      'metadata.userTeams.keyword': DEMO_DATA_TEAM,
    },
  });

  return {
    bool: {
      should: shouldClauses,
      minimum_should_match: 1,
    },
  };
}

/**
 * Determines effective team IDs for a user when storing reports
 *
 * For users with no teams, assigns them to the DEMO_DATA_TEAM
 * to ensure their uploads are visible to all users as demo data.
 *
 * @param userTeamIds - Array of team IDs the user belongs to
 * @returns Array of effective team IDs to use for the report
 */
export function getEffectiveTeamIds(userTeamIds: string[]): string[] {
  return userTeamIds.length > 0 ? userTeamIds : [DEMO_DATA_TEAM];
}

/**
 * Determines if uploaded data should be marked as demo data
 *
 * Data is considered demo data if the user has no team assignments,
 * which means they are likely new users or in a demo environment.
 *
 * @param userTeamIds - Array of team IDs the user belongs to
 * @returns true if the data should be marked as demo data
 */
export function shouldMarkAsDemoData(userTeamIds: string[]): boolean {
  return userTeamIds.length === 0;
}
