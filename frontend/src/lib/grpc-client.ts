/**
 * gRPC-Web Client for ScaledTest
 *
 * This module provides Connect-based gRPC-Web clients for all backend services.
 * It uses gRPC-Web transport for full gRPC compatibility including streaming.
 */

import { createClient, type Transport } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { AuthService } from "../gen/auth_pb";
import { K8sClusterService } from "../gen/k8s_clusters_pb";
import { SystemSettingsService } from "../gen/system_settings_pb";
import { HealthService } from "../gen/health_pb";
import { TestJobService } from "../gen/test_jobs_pb";
import { TestResultService } from "../gen/test_results_pb";

// Base URL for the API - uses Vite proxy in development
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

/**
 * Session storage for auth tokens
 */
interface AuthSession {
  accessToken: string;
  expiresAt: number;
}

let currentSession: AuthSession | null = null;

// Load session from localStorage on module init
const storedSession = localStorage.getItem("grpc_auth_session");
if (storedSession) {
  try {
    currentSession = JSON.parse(storedSession);
    // Clear expired session
    if (currentSession && currentSession.expiresAt < Date.now()) {
      currentSession = null;
      localStorage.removeItem("grpc_auth_session");
    }
  } catch {
    localStorage.removeItem("grpc_auth_session");
  }
}

/**
 * Set the auth session (call after successful login)
 */
export function setAuthSession(accessToken: string, expiresInSeconds: number): void {
  currentSession = {
    accessToken,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
  localStorage.setItem("grpc_auth_session", JSON.stringify(currentSession));
}

/**
 * Clear the auth session (call on logout)
 */
export function clearAuthSession(): void {
  currentSession = null;
  localStorage.removeItem("grpc_auth_session");
}

/**
 * Get the current access token
 */
export function getAccessToken(): string | null {
  if (currentSession && currentSession.expiresAt > Date.now()) {
    return currentSession.accessToken;
  }
  return null;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

/**
 * Create the gRPC-Web transport with authorization interceptor
 */
function createAuthenticatedTransport(): Transport {
  return createGrpcWebTransport({
    baseUrl: API_BASE_URL,
    // Use JSON format for better compatibility with proxies/ingress
    // Binary format has issues with nginx ingress content handling
    useBinaryFormat: false,
    // Add auth header interceptor
    interceptors: [
      (next) => async (req) => {
        const token = getAccessToken();
        if (token) {
          req.header.set("Authorization", `Bearer ${token}`);
        }
        return next(req);
      },
    ],
  });
}

/**
 * Create transport without auth (for public endpoints like login/signup)
 */
function createPublicTransport(): Transport {
  return createGrpcWebTransport({
    baseUrl: API_BASE_URL,
    useBinaryFormat: false,
  });
}

// Lazy-initialized clients
let _authClient: ReturnType<typeof createClient<typeof AuthService>> | null = null;
let _k8sClusterClient: ReturnType<typeof createClient<typeof K8sClusterService>> | null = null;
let _systemSettingsClient: ReturnType<typeof createClient<typeof SystemSettingsService>> | null = null;
let _healthClient: ReturnType<typeof createClient<typeof HealthService>> | null = null;
let _testJobClient: ReturnType<typeof createClient<typeof TestJobService>> | null = null;
let _testResultClient: ReturnType<typeof createClient<typeof TestResultService>> | null = null;

/**
 * Get the Auth service client (uses public transport - no auth required for login/signup)
 */
export function getAuthClient() {
  if (!_authClient) {
    // Auth client doesn't need auth header for login/signup
    // But needs it for logout/getCurrentUser - we'll handle this with a hybrid approach
    _authClient = createClient(AuthService, createAuthenticatedTransport());
  }
  return _authClient;
}

/**
 * Get the K8s Cluster service client
 */
export function getK8sClusterClient() {
  if (!_k8sClusterClient) {
    _k8sClusterClient = createClient(K8sClusterService, createAuthenticatedTransport());
  }
  return _k8sClusterClient;
}

/**
 * Get the System Settings service client
 */
export function getSystemSettingsClient() {
  if (!_systemSettingsClient) {
    _systemSettingsClient = createClient(SystemSettingsService, createAuthenticatedTransport());
  }
  return _systemSettingsClient;
}

/**
 * Get the Health service client
 */
export function getHealthClient() {
  if (!_healthClient) {
    _healthClient = createClient(HealthService, createPublicTransport());
  }
  return _healthClient;
}

/**
 * Get the Test Job service client
 */
export function getTestJobClient() {
  if (!_testJobClient) {
    _testJobClient = createClient(TestJobService, createAuthenticatedTransport());
  }
  return _testJobClient;
}

/**
 * Get the Test Result service client
 */
export function getTestResultClient() {
  if (!_testResultClient) {
    _testResultClient = createClient(TestResultService, createAuthenticatedTransport());
  }
  return _testResultClient;
}

/**
 * Reset all clients (call after auth state changes)
 */
export function resetClients(): void {
  _authClient = null;
  _k8sClusterClient = null;
  _systemSettingsClient = null;
  _healthClient = null;
  _testJobClient = null;
  _testResultClient = null;
}
