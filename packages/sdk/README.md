# @scaledtest/sdk

TypeScript/JavaScript client for the [ScaledTest](https://github.com/MichielDean/ScaledTest) API.

Upload CTRF test reports, query results, and manage test executions programmatically from CI pipelines, test runners, or any Node.js/browser application.

## Installation

```bash
npm install @scaledtest/sdk
# or
yarn add @scaledtest/sdk
```

## Quick start

```typescript
import { ScaledTestClient } from '@scaledtest/sdk';

const client = new ScaledTestClient({
  baseUrl: 'https://scaledtest.example.com',
  apiToken: process.env.SCALEDTEST_API_TOKEN, // sct_...
});

// Upload a CTRF test report
const result = await client.uploadReport({
  reportFormat: 'CTRF',
  specVersion: '0.0.1',
  results: {
    tool: { name: 'jest' },
    summary: {
      tests: 10,
      passed: 9,
      failed: 1,
      skipped: 0,
      pending: 0,
      other: 0,
      start: Date.now() - 5000,
      stop: Date.now(),
    },
    tests: [
      { name: 'should work', status: 'passed', duration: 42 },
      // ...
    ],
  },
});

console.log('Uploaded report:', result.id);
```

## Authentication

### API token (recommended for CI)

Create an API token via the ScaledTest UI or API (`POST /api/v1/teams/{teamId}/tokens`) and pass it as `apiToken`:

```typescript
const client = new ScaledTestClient({
  baseUrl: 'https://scaledtest.example.com',
  apiToken: 'sct_your_token_here',
});
```

### Cookie/session (browser apps)

Omit `apiToken` to use cookie-based authentication (the browser's session cookie is sent automatically):

```typescript
const client = new ScaledTestClient({
  baseUrl: 'https://scaledtest.example.com',
});
```

## API reference

### `new ScaledTestClient(options)`

| Option      | Type     | Required | Description                               |
| ----------- | -------- | -------- | ----------------------------------------- |
| `baseUrl`   | `string` | ✅       | Base URL of your ScaledTest instance      |
| `apiToken`  | `string` | ❌       | API token (`sct_...`) for Bearer auth     |
| `timeoutMs` | `number` | ❌       | Request timeout in ms (default: `30_000`) |

### Reports

#### `client.uploadReport(report)` → `Promise<UploadReportResult>`

Upload a CTRF report. Returns `{ id, message, summary }`.

#### `client.getReports(filters?)` → `Promise<PaginatedResult<StoredReport>>`

Query stored reports. Optional filters: `page`, `size`, `status`, `tool`, `environment`.

### Stats

#### `client.getStats()` → `Promise<Stats>`

Get dashboard summary: `totalReports`, `totalTests`, `passRateLast7d`, `totalExecutions`, `activeExecutions`.

### Executions

#### `client.listExecutions(filters?)` → `Promise<PaginatedResult<TestExecution>>`

List executions. Optional filters: `page`, `size`, `status`, `teamId`, `requestedBy`, `dateFrom`, `dateTo`.

#### `client.getExecution(id)` → `Promise<ExecutionDetail>`

Get execution detail including `activePods` and `linkedReportIds`.

#### `client.createExecution(input)` → `Promise<TestExecution>`

Create a new execution. Requires `maintainer` or `owner` role.

| Field             | Type                     | Required | Description                       |
| ----------------- | ------------------------ | -------- | --------------------------------- |
| `dockerImage`     | `string`                 | ✅       | Docker image to run tests in      |
| `testCommand`     | `string`                 | ✅       | Command to execute                |
| `parallelism`     | `number`                 | ❌       | Number of pods (1–50, default: 1) |
| `environmentVars` | `Record<string, string>` | ❌       | Environment variables             |
| `resourceLimits`  | `{ cpu?, memory? }`      | ❌       | Kubernetes resource limits        |
| `teamId`          | `string`                 | ❌       | UUID of the owning team           |

#### `client.cancelExecution(id)` → `Promise<TestExecution>`

Cancel a queued or running execution. Requires `owner` role.

#### `client.getActiveExecutions(filters?)` → `Promise<ActiveExecutionsResult>`

Get count of active (queued or running) executions. Optional `teamId` filter.

## Error handling

All methods throw typed errors that extend `ScaledTestError`:

```typescript
import {
  ScaledTestClient,
  ScaledTestError,
  AuthenticationError,
  PermissionError,
  ValidationError,
  NotFoundError,
  ConflictError,
} from '@scaledtest/sdk';

try {
  await client.uploadReport(report);
} catch (err) {
  if (err instanceof AuthenticationError) {
    console.error('Check your API token');
  } else if (err instanceof ValidationError) {
    console.error('Invalid report format:', err.details);
  } else if (err instanceof ScaledTestError) {
    console.error(`API error ${err.statusCode}:`, err.message);
  }
}
```

| Error class           | Status | When thrown                      |
| --------------------- | ------ | -------------------------------- |
| `AuthenticationError` | 401    | Missing or invalid credentials   |
| `PermissionError`     | 403    | Insufficient role                |
| `ValidationError`     | 400    | Invalid input (client or server) |
| `NotFoundError`       | 404    | Resource not found               |
| `ConflictError`       | 409    | Resource in incompatible state   |
| `ScaledTestError`     | varies | Any other API or network error   |

## Requirements

- Node.js ≥ 18 (uses the global `fetch` API)
- TypeScript ≥ 5.0 (if using types)
