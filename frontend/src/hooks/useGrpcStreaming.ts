/**
 * gRPC Streaming Hooks for ScaledTest
 *
 * React hooks for consuming gRPC streaming endpoints using Connect-Web.
 * These hooks handle connection management, reconnection, and cleanup automatically.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { HealthService, type HealthCheckResponse, ServingStatus } from "../gen/health_pb";
import { TestJobService, type TestJobStatusUpdate, type JobLogChunk } from "../gen/test_jobs_pb";
import { create } from "@bufbuild/protobuf";
import { HealthCheckRequestSchema } from "../gen/health_pb";
import { StreamJobStatusRequestSchema, StreamJobLogsRequestSchema } from "../gen/test_jobs_pb";

// Base URL for the API - uses Vite proxy in development
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

/**
 * Get auth token from session storage
 */
function getAuthToken(): string | null {
  const storedSession = localStorage.getItem("grpc_auth_session");
  if (storedSession) {
    try {
      const session = JSON.parse(storedSession);
      if (session && session.expiresAt > Date.now()) {
        return session.accessToken;
      }
    } catch {
      // Ignore parse errors
    }
  }
  return null;
}

/**
 * Create an authenticated transport for streaming
 */
function createStreamingTransport() {
  const token = getAuthToken();
  return createGrpcWebTransport({
    baseUrl: API_BASE_URL,
    interceptors: token ? [
      (next) => async (req) => {
        req.header.set("Authorization", `Bearer ${token}`);
        return next(req);
      },
    ] : [],
  });
}

/**
 * Connection state for streaming hooks
 */
export type StreamingState = "disconnected" | "connecting" | "connected" | "error";

/**
 * Hook result for streaming connections
 */
export interface StreamingResult<T> {
  data: T | null;
  state: StreamingState;
  error: Error | null;
  reconnect: () => void;
  disconnect: () => void;
}

/**
 * Hook for watching health status via gRPC streaming
 *
 * @param service - Optional service name to watch (empty for overall health)
 * @param enabled - Whether streaming should be enabled
 * @returns Streaming result with health check responses
 */
export function useHealthWatch(
  service: string = "",
  enabled: boolean = true
): StreamingResult<HealthCheckResponse> {
  const [data, setData] = useState<HealthCheckResponse | null>(null);
  const [state, setState] = useState<StreamingState>("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const connect = useCallback(async () => {
    if (!enabled) return;

    // Abort any existing connection
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setState("connecting");
    setError(null);

    try {
      const transport = createStreamingTransport();
      const client = createClient(HealthService, transport);
      const request = create(HealthCheckRequestSchema, { service });

      setState("connected");

      for await (const response of client.watch(request, { signal: abortController.signal })) {
        if (abortController.signal.aborted) break;
        setData(response);
      }

      // Stream ended normally
      if (!abortController.signal.aborted) {
        setState("disconnected");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setState("disconnected");
      } else {
        setError(err instanceof Error ? err : new Error(String(err)));
        setState("error");
      }
    }
  }, [service, enabled]);

  const disconnect = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setState("disconnected");
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    connect();
  }, [connect, disconnect]);

  useEffect(() => {
    if (enabled) {
      connect();
    }
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [connect, enabled]);

  return { data, state, error, reconnect, disconnect };
}

/**
 * Hook for streaming test job status updates
 *
 * @param projectId - The project ID to watch jobs for
 * @param k8sJobName - Optional specific job name to watch
 * @param enabled - Whether streaming should be enabled
 * @returns Streaming result with job status updates
 */
export function useJobStatusStream(
  projectId: string,
  k8sJobName?: string,
  enabled: boolean = true
): StreamingResult<TestJobStatusUpdate> {
  const [data, setData] = useState<TestJobStatusUpdate | null>(null);
  const [state, setState] = useState<StreamingState>("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const connect = useCallback(async () => {
    if (!enabled || !projectId) return;

    // Abort any existing connection
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setState("connecting");
    setError(null);

    try {
      const transport = createStreamingTransport();
      const client = createClient(TestJobService, transport);
      const request = create(StreamJobStatusRequestSchema, { projectId, k8sJobName });

      setState("connected");

      for await (const response of client.streamJobStatus(request, { signal: abortController.signal })) {
        if (abortController.signal.aborted) break;
        setData(response);
      }

      // Stream ended normally
      if (!abortController.signal.aborted) {
        setState("disconnected");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setState("disconnected");
      } else {
        setError(err instanceof Error ? err : new Error(String(err)));
        setState("error");
      }
    }
  }, [projectId, k8sJobName, enabled]);

  const disconnect = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setState("disconnected");
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    connect();
  }, [connect, disconnect]);

  useEffect(() => {
    if (enabled && projectId) {
      connect();
    }
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [connect, enabled, projectId]);

  return { data, state, error, reconnect, disconnect };
}

/**
 * Hook for streaming test job logs
 *
 * @param jobId - The ID of the job to get logs for
 * @param follow - Whether to follow (tail) the logs
 * @param enabled - Whether streaming should be enabled
 * @returns Streaming result with log chunks (accumulates all chunks)
 */
export function useJobLogsStream(
  jobId: string,
  follow: boolean = true,
  enabled: boolean = true
): StreamingResult<JobLogChunk[]> & { logs: JobLogChunk[] } {
  const [logs, setLogs] = useState<JobLogChunk[]>([]);
  const [state, setState] = useState<StreamingState>("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const connect = useCallback(async () => {
    if (!enabled || !jobId) return;

    // Abort any existing connection
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setState("connecting");
    setError(null);
    setLogs([]);

    try {
      const transport = createStreamingTransport();
      const client = createClient(TestJobService, transport);
      const request = create(StreamJobLogsRequestSchema, { jobId, follow });

      setState("connected");

      for await (const chunk of client.streamJobLogs(request, { signal: abortController.signal })) {
        if (abortController.signal.aborted) break;
        setLogs((prev) => [...prev, chunk]);
      }

      // Stream ended normally
      if (!abortController.signal.aborted) {
        setState("disconnected");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setState("disconnected");
      } else {
        setError(err instanceof Error ? err : new Error(String(err)));
        setState("error");
      }
    }
  }, [jobId, follow, enabled]);

  const disconnect = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setState("disconnected");
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    connect();
  }, [connect, disconnect]);

  useEffect(() => {
    if (enabled && jobId) {
      connect();
    }
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [connect, enabled, jobId]);

  return { data: logs, logs, state, error, reconnect, disconnect };
}

/**
 * Utility function to get human-readable serving status
 */
export function getServingStatusText(status: ServingStatus): string {
  switch (status) {
    case ServingStatus.SERVING:
      return "Healthy";
    case ServingStatus.NOT_SERVING:
      return "Unhealthy";
    case ServingStatus.SERVICE_UNKNOWN:
      return "Unknown";
    default:
      return "Unknown";
  }
}

/**
 * Utility function to get status color class
 */
export function getServingStatusColor(status: ServingStatus): string {
  switch (status) {
    case ServingStatus.SERVING:
      return "text-green-600";
    case ServingStatus.NOT_SERVING:
      return "text-red-600";
    case ServingStatus.SERVICE_UNKNOWN:
      return "text-yellow-600";
    default:
      return "text-gray-600";
  }
}
