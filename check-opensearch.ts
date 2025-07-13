import opensearchClient from './src/lib/opensearch';
import { dbLogger as logger } from './src/logging/logger';

async function checkDemoDataInOpenSearch() {
  try {
    logger.info('Checking for demo data in OpenSearch...');

    // Search for all reports
    const allReports = await opensearchClient.search({
      index: 'ctrf-reports',
      body: {
        query: { match_all: {} },
        size: 100,
      },
    });

    console.log('Total reports in OpenSearch:', allReports.body.hits.total);

    // Search specifically for demo data
    const demoReports = await opensearchClient.search({
      index: 'ctrf-reports',
      body: {
        query: {
          bool: {
            should: [
              { term: { 'metadata.isDemoData': true } },
              { term: { 'metadata.userTeams.keyword': 'demo-data' } },
            ],
            minimum_should_match: 1,
          },
        },
        size: 100,
      },
    });

    console.log('Demo reports found:', demoReports.body.hits.total);

    if (allReports.body.hits.hits.length > 0) {
      console.log('Sample report metadata:');
      const sampleReport = allReports.body.hits.hits[0];
      if (sampleReport?._source?.metadata) {
        console.log(JSON.stringify(sampleReport._source.metadata, null, 2));
      }
    }
  } catch (error) {
    logger.error('Error checking demo data:', error);
    console.error('Error:', error);
  }
}

checkDemoDataInOpenSearch().catch(console.error);
