#!/usr/bin/env node

/**
 * Debug script to examine demo data storage and access patterns in detail
 */

// Set up environment variables first, before any imports
(async () => {
  // Configure environment
  process.env.OPENSEARCH_HOST = 'http://localhost:9200';
  process.env.OPENSEARCH_USERNAME = 'admin';
  process.env.OPENSEARCH_PASSWORD = 'admin';
  process.env.OPENSEARCH_SSL_VERIFY = 'false';

  // Now import modules after env vars are set
  const opensearchClient = (await import('./src/lib/opensearch.js')).default;
  const { getUserTeams } = await import('./src/authentication/teamManagement.js');
  const logger = (await import('./src/logging/logger.js')).default;

  const debugLogger = logger.child({ module: 'debug-demo-data-detailed' });

  async function debugDemoDataDetailed() {
    try {
      debugLogger.info('=== Starting detailed demo data analysis ===');

      // Search for ALL documents in the index
      const allDocsResponse = await opensearchClient.search({
        index: 'ctrf-reports',
        body: {
          query: { match_all: {} },
          size: 100,
          _source: true,
        },
      });

      const allDocs: any[] = allDocsResponse.body.hits.hits;
      debugLogger.info('Total documents in index', { count: allDocs.length });

      // Group documents by metadata patterns
      const documentsByPattern = {
        hasDemoData: [] as string[],
        hasDemoTeam: [] as string[],
        hasEnvironmentDemo: [] as string[],
        hasToolDemo: [] as string[],
        noTeams: [] as string[],
        withTeams: [] as string[],
      };

      allDocs.forEach((doc: any, index: number) => {
        const source = doc._source;
        debugLogger.info(`Document ${index + 1}`, {
          id: doc._id,
          metadata: source.metadata,
          tool: source.results?.tool?.name,
          environment: source.results?.environment,
          userTeams: source.metadata?.userTeams,
          isDemoData: source.metadata?.isDemoData,
          uploadedBy: source.metadata?.uploadedBy,
        });

        // Categorize documents
        if (source.metadata?.isDemoData === true) {
          documentsByPattern.hasDemoData.push(doc._id);
        }
        if (source.metadata?.userTeams?.includes('demo-data')) {
          documentsByPattern.hasDemoTeam.push(doc._id);
        }
        if (source.results?.environment?.testEnvironment === 'demo') {
          documentsByPattern.hasEnvironmentDemo.push(doc._id);
        }
        if (source.results?.tool?.name?.toLowerCase().includes('demo')) {
          documentsByPattern.hasToolDemo.push(doc._id);
        }
        if (!source.metadata?.userTeams || source.metadata.userTeams.length === 0) {
          documentsByPattern.noTeams.push(doc._id);
        } else {
          documentsByPattern.withTeams.push(doc._id);
        }
      });

      debugLogger.info('Documents by pattern', documentsByPattern);

      // Test specific user team lookups
      const testUsers = ['maintainer@example.com', 'readonly@example.com', 'owner@example.com'];

      for (const userEmail of testUsers) {
        try {
          // For demo purposes, let's create a mock user object that matches the expected format
          const mockUser = { sub: userEmail, email: userEmail };
          const teams = await getUserTeams(mockUser.sub);
          debugLogger.info(`User teams for ${userEmail}`, {
            userSub: mockUser.sub,
            teams: teams.map(t => ({ id: t.id, name: t.name })),
          });
        } catch (error) {
          const err = error as Error;
          debugLogger.error(`Failed to get teams for ${userEmail}`, { error: err.message });
        }
      }

      // Test the access control filter logic that should be used in the API
      debugLogger.info('=== Testing access control patterns ===');

      // Test pattern 1: User with no teams should see demo data
      const noTeamsFilter = {
        bool: {
          should: [
            { term: { 'metadata.isDemoData': true } },
            { term: { 'metadata.userTeams.keyword': 'demo-data' } },
          ],
          minimum_should_match: 1,
        },
      };

      const noTeamsResponse = await opensearchClient.search({
        index: 'ctrf-reports',
        body: {
          query: noTeamsFilter,
          size: 100,
        },
      });

      debugLogger.info('Documents accessible to users with no teams', {
        count: noTeamsResponse.body.hits.hits.length,
        documents: noTeamsResponse.body.hits.hits.map((hit: any) => ({
          id: hit._id,
          isDemoData: hit._source.metadata?.isDemoData,
          userTeams: hit._source.metadata?.userTeams,
          environment: hit._source.results?.environment?.testEnvironment,
        })),
      });
    } catch (error) {
      const err = error as Error;
      debugLogger.error('Debug script failed', { error: err.message, stack: err.stack });
    }
  }

  // Run the debug script
  debugDemoDataDetailed()
    .then(() => {
      debugLogger.info('=== Debug analysis complete ===');
      process.exit(0);
    })
    .catch(error => {
      const err = error as Error;
      debugLogger.error('Debug script crashed', { error: err.message });
      process.exit(1);
    });
})();
