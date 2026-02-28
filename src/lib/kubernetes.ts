import { readFileSync } from 'fs';
import https from 'https';
import { dbLogger as logger, logError } from '../logging/logger';
import { TestExecution, updateExecutionStatus, listExecutions } from './executions';

// Kubernetes client config — reads from in-cluster service account or KUBECONFIG
export interface KubernetesConfig {
  apiServer: string;
  token: string;
  namespace: string;
  skipTlsVerify?: boolean;
}

// Memoized — config reads from the service account token file on disk; no need to re-read
// on every request. Null means Kubernetes is not configured (local dev without a cluster).
let _cachedKubernetesConfig: KubernetesConfig | null | undefined = undefined;

function getKubernetesConfig(): KubernetesConfig | null {
  if (_cachedKubernetesConfig !== undefined) return _cachedKubernetesConfig;

  // In-cluster: service account token is mounted at well-known path
  try {
    const token = readFileSync(
      '/var/run/secrets/kubernetes.io/serviceaccount/token',
      'utf8'
    ).trim();
    const apiServer = `https://${process.env.KUBERNETES_SERVICE_HOST}:${process.env.KUBERNETES_SERVICE_PORT}`;
    _cachedKubernetesConfig = {
      apiServer,
      token,
      namespace: process.env.SCALEDTEST_NAMESPACE ?? 'scaledtest',
    };
  } catch {
    // Not in-cluster — check env vars for out-of-cluster dev setup
    if (process.env.KUBERNETES_API_SERVER && process.env.KUBERNETES_TOKEN) {
      _cachedKubernetesConfig = {
        apiServer: process.env.KUBERNETES_API_SERVER,
        token: process.env.KUBERNETES_TOKEN,
        namespace: process.env.SCALEDTEST_NAMESPACE ?? 'scaledtest',
        skipTlsVerify: process.env.KUBERNETES_SKIP_TLS === 'true',
      };
    } else {
      _cachedKubernetesConfig = null;
    }
  }

  return _cachedKubernetesConfig;
}

// Exported for testing only — allows resetting the memoized config between test runs
export function _resetKubernetesConfigCache(): void {
  _cachedKubernetesConfig = undefined;
}

async function kubernetesRequest(
  config: KubernetesConfig,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const url = `${config.apiServer}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // When skipTlsVerify is requested (dev clusters with self-signed certs), scope the
  // rejectUnauthorized:false to THIS request only via an https.Agent.
  // NEVER set process.env.NODE_TLS_REJECT_UNAUTHORIZED — that disables TLS verification
  // globally for the entire process, affecting all outbound connections permanently.
  const fetchOptions: Parameters<typeof fetch>[1] & { agent?: https.Agent } = {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  };

  if (config.skipTlsVerify) {
    // Only used in dev environments. In production skipTlsVerify must never be true.
    fetchOptions.agent = new https.Agent({ rejectUnauthorized: false });
  }

  const response = await fetch(url, fetchOptions);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kubernetes API ${method} ${path} failed: ${response.status} ${text}`);
  }
  return response.json();
}

export async function createKubernetesJob(execution: TestExecution): Promise<string> {
  const config = getKubernetesConfig();
  if (!config) {
    logger.warn(
      { executionId: execution.id },
      'Kubernetes not configured — execution queued but not scheduled'
    );
    return 'kubernetes-not-configured';
  }

  // Job name: "scaledtest-" (11) + first 8 hex chars of UUID (8) + "-" (1) + epoch ms (13) = 33 chars.
  // K8s names must be ≤63 chars, RFC 1123 compliant (lowercase alphanum + "-").
  // UUID v4 hex chars are [0-9a-f] so substring(0,8) is always RFC-1123-safe.
  const jobName = `scaledtest-${execution.id.substring(0, 8)}-${Date.now()}`;
  const resourceLimits = execution.resourceLimits;

  const jobSpec = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: jobName,
      namespace: config.namespace,
      labels: {
        'app.kubernetes.io/name': 'scaledtest-worker',
        'scaledtest.io/execution-id': execution.id,
      },
    },
    spec: {
      parallelism: execution.parallelism,
      completions: execution.parallelism,
      backoffLimit: 1,
      ttlSecondsAfterFinished: 3600,
      template: {
        metadata: {
          labels: {
            'app.kubernetes.io/name': 'scaledtest-worker',
            'scaledtest.io/execution-id': execution.id,
          },
        },
        spec: {
          restartPolicy: 'Never',
          containers: [
            {
              name: 'test-worker',
              image: execution.dockerImage,
              env: [
                { name: 'TEST_COMMAND', value: execution.testCommand },
                { name: 'EXECUTION_ID', value: execution.id },
                {
                  name: 'SCALEDTEST_API_URL',
                  value: process.env.NEXT_PUBLIC_BASE_URL
                    ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/v1`
                    : 'http://scaledtest-service/api/v1',
                },
                {
                  name: 'SCALEDTEST_API_TOKEN',
                  valueFrom: {
                    secretKeyRef: { name: 'scaledtest-worker-token', key: 'token' },
                  },
                },
                ...Object.entries(execution.environmentVars).map(([name, value]) => ({
                  name,
                  value,
                })),
              ],
              resources: {
                requests: {
                  cpu: resourceLimits.cpu ?? '250m',
                  memory: resourceLimits.memory ?? '256Mi',
                },
                limits: {
                  cpu: resourceLimits.cpu ?? '500m',
                  memory: resourceLimits.memory ?? '512Mi',
                },
              },
            },
          ],
        },
      },
    },
  };

  await kubernetesRequest(
    config,
    'POST',
    `/apis/batch/v1/namespaces/${config.namespace}/jobs`,
    jobSpec
  );

  logger.info({ executionId: execution.id, jobName }, 'Kubernetes Job created');
  return jobName;
}

export async function getJobStatus(jobName: string): Promise<{
  active: number;
  succeeded: number;
  failed: number;
} | null> {
  const config = getKubernetesConfig();
  if (!config) return null;

  try {
    const job = (await kubernetesRequest(
      config,
      'GET',
      `/apis/batch/v1/namespaces/${config.namespace}/jobs/${jobName}`
    )) as { status?: { active?: number; succeeded?: number; failed?: number } };

    return {
      active: job.status?.active ?? 0,
      succeeded: job.status?.succeeded ?? 0,
      failed: job.status?.failed ?? 0,
    };
  } catch (error) {
    logError(logger, 'Failed to get job status', error, { jobName });
    return null;
  }
}

export async function deleteKubernetesJob(jobName: string): Promise<void> {
  const config = getKubernetesConfig();
  if (!config) return;

  try {
    await kubernetesRequest(
      config,
      'DELETE',
      `/apis/batch/v1/namespaces/${config.namespace}/jobs/${jobName}`,
      { propagationPolicy: 'Foreground' }
    );
    logger.info({ jobName }, 'Kubernetes Job deleted');
  } catch (error) {
    logError(logger, 'Failed to delete job', error, { jobName });
    throw error;
  }
}

// Executor loop — polls for queued executions and creates K8s jobs
let executorLoopTimer: ReturnType<typeof setInterval> | null = null;

export async function runExecutorCycle(): Promise<void> {
  try {
    // Find queued executions
    const { executions: queued } = await listExecutions({ status: 'queued', size: 10 });
    for (const execution of queued) {
      try {
        const jobName = await createKubernetesJob(execution);
        await updateExecutionStatus(execution.id, 'running', {
          kubernetesJobName: jobName,
          startedAt: new Date().toISOString(),
          totalPods: execution.parallelism,
        });
      } catch (err) {
        logError(logger, 'Failed to schedule execution', err, { executionId: execution.id });
        await updateExecutionStatus(execution.id, 'failed', {
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Check running executions
    const { executions: running } = await listExecutions({ status: 'running', size: 50 });
    for (const execution of running) {
      if (
        !execution.kubernetesJobName ||
        execution.kubernetesJobName === 'kubernetes-not-configured'
      )
        continue;

      const status = await getJobStatus(execution.kubernetesJobName);
      if (!status) continue;

      const total = status.active + status.succeeded + status.failed;
      const isComplete = status.active === 0 && total > 0;

      if (isComplete) {
        const finalStatus = status.failed > 0 ? 'failed' : 'completed';
        await updateExecutionStatus(execution.id, finalStatus, {
          completedAt: new Date().toISOString(),
          completedPods: status.succeeded,
          failedPods: status.failed,
        });
        logger.info({ executionId: execution.id, finalStatus }, 'Execution completed');
      } else {
        // Update in-progress pod counts
        await updateExecutionStatus(execution.id, 'running', {
          completedPods: status.succeeded,
          failedPods: status.failed,
        });
      }
    }
  } catch (error) {
    logError(logger, 'Executor cycle error', error);
  }
}

export function startExecutorLoop(intervalMs = 10000): void {
  if (executorLoopTimer) return; // already running
  logger.info({ intervalMs }, 'Starting executor loop');
  executorLoopTimer = setInterval(() => void runExecutorCycle(), intervalMs);
}

export function stopExecutorLoop(): void {
  if (executorLoopTimer) {
    clearInterval(executorLoopTimer);
    executorLoopTimer = null;
  }
}
