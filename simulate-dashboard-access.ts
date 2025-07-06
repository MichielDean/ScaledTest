import { getUserTeams } from './src/authentication/teamManagement';
import { keycloakConfig } from './src/config/keycloak';
import { dbLogger as logger } from './src/logging/logger';
import axios from 'axios';

async function simulateDashboardAccess() {
  try {
    // Test what happens when a user with no teams tries to access reports
    const userId = 'db123d9a-d98d-4133-85bf-8a239c0cced8'; // maintainer user ID we got earlier

    console.log('Simulating dashboard access for user:', userId);

    // Get user teams (should be empty)
    const userTeams = await getUserTeams(userId);
    const teamIds = userTeams.map(team => team.id);

    console.log('User teams:', teamIds);

    // Simulate the filter logic from the API
    const teamAccessFilter = [];

    // If user has teams, they can see reports from those teams
    if (teamIds.length > 0) {
      teamAccessFilter.push({
        terms: {
          'metadata.userTeams.keyword': teamIds,
        },
      });
    }

    // User can always see reports they uploaded themselves
    teamAccessFilter.push({
      term: {
        'metadata.uploadedBy.keyword': userId,
      },
    });

    // All users can see demo data (reports marked with isDemoData or with demo-data team)
    teamAccessFilter.push({
      term: {
        'metadata.isDemoData': true,
      },
    });

    teamAccessFilter.push({
      term: {
        'metadata.userTeams.keyword': 'demo-data',
      },
    });

    console.log('OpenSearch query filters that would be applied:');
    console.log(
      JSON.stringify(
        {
          bool: {
            should: teamAccessFilter,
            minimum_should_match: 1,
          },
        },
        null,
        2
      )
    );

    console.log('\nThis means the user can see:');
    console.log('1. Reports they uploaded themselves');
    console.log('2. Reports marked with isDemoData: true');
    console.log('3. Reports with userTeams containing "demo-data"');
  } catch (error) {
    logger.error('Error simulating dashboard access:', error);
    console.error('Error:', error);
  }
}

simulateDashboardAccess().catch(console.error);
