/**
 * Debug script to check what data is actually stored in OpenSearch
 */

import { generateCtrfReport } from './tests/data/ctrfReportGenerator';
import { getAuthToken } from './tests/authentication/tokenService';
import logger from './src/logging/logger';

const testLogger = logger.child({ module: 'debug-demo-data' });

async function debugDemoData() {
  const baseUrl = 'http://localhost:3000';

  try {
    // Get a maintainer token (user with no teams)
    const maintainerToken = await getAuthToken('maintainer@example.com', 'password');

    // Upload some demo data
    const demoReport = generateCtrfReport({
      tool: 'Debug-Jest',
      environment: 'demo',
      tests: 5,
      passed: 4,
      failed: 1,
      skipped: 0,
    });

    const uploadResponse = await fetch(`${baseUrl}/api/test-reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${maintainerToken}`,
      },
      body: JSON.stringify(demoReport),
    });

    testLogger.info('Upload response', {
      status: uploadResponse.status,
      ok: uploadResponse.ok,
    });

    if (uploadResponse.ok) {
      const uploadResult = await uploadResponse.json();
      testLogger.info('Demo data uploaded', { reportId: uploadResult.id });

      // Now try to retrieve it
      const getResponse = await fetch(`${baseUrl}/api/test-reports?size=20`, {
        headers: {
          Authorization: `Bearer ${maintainerToken}`,
        },
      });

      testLogger.info('Get response', {
        status: getResponse.status,
        ok: getResponse.ok,
      });

      if (getResponse.ok) {
        const getResult = await getResponse.json();
        console.log('=== RETRIEVED REPORTS DEBUG ===');
        console.log('Success:', getResult.success);
        console.log('Total:', getResult.total);
        console.log('Report count:', getResult.data?.length || 0);
        console.log('Reports details:');
        getResult.data?.forEach((r: any, index: number) => {
          console.log(`  Report ${index + 1}:`);
          console.log(`    ID: ${r._id}`);
          console.log(`    Tool: ${r.results?.tool?.name}`);
          console.log(`    Environment: ${r.results?.environment}`);
          console.log(`    isDemoData: ${r.metadata?.isDemoData}`);
          console.log(`    userTeams: ${JSON.stringify(r.metadata?.userTeams)}`);
          console.log(`    uploadedBy: ${r.metadata?.uploadedBy}`);
        });
        console.log('=== END DEBUG ===');

        testLogger.info('Retrieved reports', {
          success: getResult.success,
          total: getResult.total,
          reportCount: getResult.data?.length || 0,
          reports:
            getResult.data?.map((r: any) => ({
              id: r._id,
              tool: r.results?.tool?.name,
              environment: r.results?.environment,
              isDemoData: r.metadata?.isDemoData,
              userTeams: r.metadata?.userTeams,
            })) || [],
        });
      } else {
        const errorResult = await getResponse.text();
        testLogger.error('Failed to retrieve reports', {
          status: getResponse.status,
          error: errorResult,
        });
      }
    } else {
      const errorResult = await uploadResponse.text();
      testLogger.error('Failed to upload demo data', {
        status: uploadResponse.status,
        error: errorResult,
      });
    }
  } catch (error) {
    testLogger.error('Debug script failed', {
      error: error instanceof Error ? error.message : error,
    });
  }
}

debugDemoData().catch(console.error);
