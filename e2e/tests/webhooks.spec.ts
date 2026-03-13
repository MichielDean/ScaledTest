import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import {
  loginViaAPI,
  tokenHeaders,
  buildCtrfReport,
  getOrCreateTeam,
  createAPIToken,
} from './helpers';

interface ReceivedRequest {
  body: string;
  headers: Record<string, string>;
}

/** Start a local HTTP server to receive webhook payloads. */
function startMockServer(): Promise<{
  server: Server;
  port: number;
  received: ReceivedRequest[];
}> {
  return new Promise(resolve => {
    const received: ReceivedRequest[] = [];
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        received.push({ body, headers: req.headers as Record<string, string> });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      resolve({ server, port, received });
    });
  });
}

test.describe('Webhooks', () => {
  test('create webhook and verify it fires on report submission', async ({ request }) => {
    const mock = await startMockServer();

    try {
      // Setup: team + API token
      const session = await loginViaAPI(request);
      const teamId = await getOrCreateTeam(request, session);
      const apiToken = await createAPIToken(request, session, teamId);
      const headers = tokenHeaders(apiToken);

      // Create a webhook listening for report.submitted
      const webhookUrl = `http://127.0.0.1:${mock.port}/webhook`;
      const createRes = await request.post(`/api/v1/teams/${teamId}/webhooks`, {
        headers,
        data: { url: webhookUrl, events: ['report.submitted'] },
      });
      expect(createRes.ok(), `Create webhook failed: ${createRes.status()}`).toBeTruthy();
      const webhook = await createRes.json();
      expect(webhook.webhook.id).toBeTruthy();
      expect(webhook.secret).toMatch(/^whsec_/);

      // Verify webhook appears in the list
      const listRes = await request.get(`/api/v1/teams/${teamId}/webhooks`, { headers });
      expect(listRes.ok()).toBeTruthy();
      const listData = await listRes.json();
      expect(listData.webhooks.length).toBeGreaterThan(0);
      expect(listData.webhooks.some((w: { id: string }) => w.id === webhook.webhook.id)).toBe(true);

      // Submit a report to trigger the webhook
      const submitRes = await request.post('/api/v1/reports', {
        headers,
        data: buildCtrfReport(`WH-Tool-${Date.now()}`),
      });
      expect(submitRes.ok()).toBeTruthy();

      // Wait for webhook delivery (async, with backoff retries up to 15s)
      const deadline = Date.now() + 15000;
      while (mock.received.length === 0 && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 200));
      }

      expect(mock.received.length).toBeGreaterThan(0);
      const delivery = mock.received[0];

      // Verify webhook payload
      const payload = JSON.parse(delivery.body);
      expect(payload.event).toBe('report.submitted');
      expect(payload.data.report_id).toBeTruthy();
      expect(payload.data.tool).toBeTruthy();
      expect(payload.timestamp).toBeTruthy();

      // Verify webhook headers
      expect(delivery.headers['x-scaledtest-event']).toBe('report.submitted');
      expect(delivery.headers['x-scaledtest-signature']).toMatch(/^sha256=/);
      expect(delivery.headers['content-type']).toBe('application/json');
    } finally {
      mock.server.close();
    }
  });

  test('webhook CRUD operations', async ({ request }) => {
    const session = await loginViaAPI(request);
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    // Create
    const createRes = await request.post(`/api/v1/teams/${teamId}/webhooks`, {
      headers,
      data: {
        url: 'https://example.com/webhook-test',
        events: ['report.submitted', 'gate.failed'],
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const { webhook } = await createRes.json();

    // Read
    const getRes = await request.get(`/api/v1/teams/${teamId}/webhooks/${webhook.id}`, {
      headers,
    });
    expect(getRes.ok()).toBeTruthy();
    const fetched = await getRes.json();
    expect(fetched.url).toBe('https://example.com/webhook-test');

    // Update
    const updateRes = await request.put(`/api/v1/teams/${teamId}/webhooks/${webhook.id}`, {
      headers,
      data: {
        url: 'https://example.com/webhook-updated',
        events: ['execution.completed'],
        enabled: false,
      },
    });
    expect(updateRes.ok()).toBeTruthy();
    const updated = await updateRes.json();
    expect(updated.url).toBe('https://example.com/webhook-updated');

    // Delete
    const deleteRes = await request.delete(`/api/v1/teams/${teamId}/webhooks/${webhook.id}`, {
      headers,
    });
    expect(deleteRes.ok()).toBeTruthy();

    // Verify deleted
    const getAfterDelete = await request.get(`/api/v1/teams/${teamId}/webhooks/${webhook.id}`, {
      headers,
    });
    expect(getAfterDelete.ok()).toBe(false);
  });
});
