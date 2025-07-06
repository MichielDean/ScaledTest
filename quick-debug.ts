#!/usr/bin/env node

/**
 * Quick debug script to check specific demo data issues
 */

// Set up environment variables first
(async () => {
  process.env.OPENSEARCH_HOST = 'http://localhost:9200';
  process.env.OPENSEARCH_USERNAME = 'admin';
  process.env.OPENSEARCH_PASSWORD = 'admin';
  process.env.OPENSEARCH_SSL_VERIFY = 'false';

  const opensearchClient = (await import('./src/lib/opensearch.js')).default;
  const logger = (await import('./src/logging/logger.js')).default;

  const debugLogger = logger.child({ module: 'quick-debug' });

  try {
    // Get just the first few documents to see their structure
    const response = await opensearchClient.search({
      index: 'ctrf-reports',
      body: {
        query: { match_all: {} },
        size: 5,
        _source: true,
      },
    });

    const docs = response.body.hits.hits;
    debugLogger.info('Sample documents', { count: docs.length });

    docs.forEach((doc: any, index: number) => {
      console.log(`\n=== Document ${index + 1} ===`);
      console.log('ID:', doc._id);
      console.log('Metadata:', JSON.stringify(doc._source.metadata, null, 2));
      console.log('Tool:', doc._source.results?.tool?.name);
      console.log('Environment:', doc._source.results?.environment?.testEnvironment);
    });

    // Test the specific query the API uses for demo data access
    const demoDataQuery = {
      bool: {
        should: [
          { term: { 'metadata.isDemoData': true } },
          { term: { 'metadata.userTeams.keyword': 'demo-data' } },
        ],
        minimum_should_match: 1,
      },
    };

    const demoResponse = await opensearchClient.search({
      index: 'ctrf-reports',
      body: {
        query: demoDataQuery,
        size: 10,
      },
    });

    console.log('\n=== Demo Data Query Results ===');
    console.log('Total found:', demoResponse.body.hits.total);
    console.log('Documents:');
    demoResponse.body.hits.hits.forEach((hit: any, index: number) => {
      console.log(`\nDemo Document ${index + 1}:`);
      console.log('ID:', hit._id);
      console.log('isDemoData:', hit._source.metadata?.isDemoData);
      console.log('userTeams:', hit._source.metadata?.userTeams);
      console.log('Tool:', hit._source.results?.tool?.name);
      console.log('Environment:', hit._source.results?.environment?.testEnvironment);
    });
  } catch (error) {
    const err = error as Error;
    debugLogger.error('Debug failed', { error: err.message, stack: err.stack });
  }

  process.exit(0);
})();
