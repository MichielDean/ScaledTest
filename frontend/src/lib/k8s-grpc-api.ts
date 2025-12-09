/**
 * K8s Platform gRPC API
 *
 * This module provides gRPC-Web based access to the K8s platform services.
 * It wraps the generated proto types and provides convenient helper functions.
 */

import { ConnectError } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { timestampDate, type Timestamp } from "@bufbuild/protobuf/wkt";
import {
  getK8sClusterClient,
  getTestJobClient,
} from "./grpc-client";

// Import proto schemas for k8s clusters
import {
  CreateClusterRequestSchema,
  GetClusterRequestSchema,
  ListClustersRequestSchema,
  DeleteClusterRequestSchema,
  TestConnectionRequestSchema,
  TestConnectionDirectRequestSchema,
  SetDefaultClusterRequestSchema,
} from "../gen/k8s_clusters_pb";

// Import proto schemas for test jobs
import {
  CreateProjectRequestSchema,
  GetProjectRequestSchema,
  ListProjectsRequestSchema,
  DeleteProjectRequestSchema,
} from "../gen/test_jobs_pb";

/**
 * Extract error message from ConnectError
 */
function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConnectError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

/**
 * Convert timestamp to ISO string safely
 */
function timestampToISO(ts: Timestamp | undefined): string {
  if (!ts) return new Date().toISOString();
  return timestampDate(ts).toISOString();
}

// ============================================================================
// K8s Cluster API
// ============================================================================

export interface K8sClusterConfig {
  name: string;
  description?: string;
  apiServerUrl: string;
  namespace: string;
  authType: "token" | "certificate" | "kubeconfig";
  bearerToken?: string;
  clientCertificate?: string;
  clientKey?: string;
  caCertificate?: string;
  skipTlsVerify?: boolean;
  kubeconfig?: string;
  isDefault?: boolean;
  projectId: string;
  environment: string;
  sutConfig?: {
    serviceName: string;
    namespace: string;
    port: number;
    protocol?: string;
  };
  runnerConfig?: {
    platformApiUrl: string;
    defaultBaseUrl: string;
    serviceAccountName: string;
    artifactsPvcName?: string;
    defaultTimeout?: number;
    defaultParallelism?: number;
  };
}

export interface K8sCluster {
  id: string;
  name: string;
  description?: string;
  apiServerUrl: string;
  namespace: string;
  authType: string;
  skipTlsVerify: boolean;
  isDefault: boolean;
  isActive: boolean;
  projectId?: string;
  environment: string;
  connectionStatus: string;
  connectionError?: string;
  lastConnectedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convert ClusterResponse proto to K8sCluster
 */
function clusterResponseToK8sCluster(response: import("../gen/k8s_clusters_pb").ClusterResponse): K8sCluster {
  return {
    id: response.id,
    name: response.name,
    description: response.description,
    apiServerUrl: response.apiServerUrl,
    namespace: response.namespace,
    authType: response.authType,
    skipTlsVerify: response.skipTlsVerify,
    isDefault: response.isDefault,
    isActive: response.isActive,
    projectId: response.projectId,
    environment: response.environment,
    connectionStatus: response.connectionStatus,
    connectionError: response.connectionError,
    lastConnectedAt: response.lastConnectedAt ? timestampToISO(response.lastConnectedAt) : undefined,
    createdBy: response.createdBy,
    createdAt: timestampToISO(response.createdAt),
    updatedAt: timestampToISO(response.updatedAt),
  };
}

/**
 * Create a new K8s cluster
 */
export async function createCluster(config: K8sClusterConfig): Promise<K8sCluster> {
  try {
    const client = getK8sClusterClient();
    const request = create(CreateClusterRequestSchema, {
      name: config.name,
      description: config.description,
      apiServerUrl: config.apiServerUrl,
      namespace: config.namespace,
      authType: config.authType,
      bearerToken: config.bearerToken,
      clientCertificate: config.clientCertificate,
      clientKey: config.clientKey,
      caCertificate: config.caCertificate,
      skipTlsVerify: config.skipTlsVerify ?? false,
      kubeconfig: config.kubeconfig,
      isDefault: config.isDefault ?? false,
      projectId: config.projectId,
      environment: config.environment,
      sutConfig: config.sutConfig ? {
        serviceName: config.sutConfig.serviceName,
        namespace: config.sutConfig.namespace,
        port: config.sutConfig.port,
        protocol: config.sutConfig.protocol,
      } : undefined,
      runnerConfig: config.runnerConfig ? {
        platformApiUrl: config.runnerConfig.platformApiUrl,
        defaultBaseUrl: config.runnerConfig.defaultBaseUrl,
        serviceAccountName: config.runnerConfig.serviceAccountName,
        artifactsPvcName: config.runnerConfig.artifactsPvcName,
        defaultTimeout: config.runnerConfig.defaultTimeout ?? 0,
        defaultParallelism: config.runnerConfig.defaultParallelism ?? 0,
      } : undefined,
    });

    const response = await client.createCluster(request);
    return clusterResponseToK8sCluster(response);
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Failed to create cluster"));
  }
}

/**
 * Get a specific cluster by ID
 */
export async function getCluster(clusterId: string): Promise<K8sCluster> {
  try {
    const client = getK8sClusterClient();
    const request = create(GetClusterRequestSchema, { clusterId });
    const response = await client.getCluster(request);
    return clusterResponseToK8sCluster(response);
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Failed to get cluster"));
  }
}

/**
 * List clusters for a project
 */
export async function listClusters(
  projectId: string,
  page = 1,
  pageSize = 20
): Promise<{ clusters: K8sCluster[]; totalCount: number }> {
  try {
    const client = getK8sClusterClient();
    const request = create(ListClustersRequestSchema, {
      projectId,
      page,
      pageSize,
    });
    const response = await client.listClusters(request);
    return {
      clusters: response.clusters.map(clusterResponseToK8sCluster),
      totalCount: response.totalCount,
    };
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Failed to list clusters"));
  }
}

/**
 * Delete a cluster
 */
export async function deleteCluster(clusterId: string): Promise<{ success: boolean; message: string }> {
  try {
    const client = getK8sClusterClient();
    const request = create(DeleteClusterRequestSchema, { clusterId });
    const response = await client.deleteCluster(request);
    return {
      success: response.success,
      message: response.message,
    };
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Failed to delete cluster"));
  }
}

/**
 * Test connection to a cluster
 */
export async function testClusterConnection(clusterId: string): Promise<{
  success: boolean;
  connected: boolean;
  message: string;
  error?: string;
  kubernetesVersion?: string;
  nodeCount?: number;
}> {
  try {
    const client = getK8sClusterClient();
    const request = create(TestConnectionRequestSchema, { clusterId });
    const response = await client.testConnection(request);
    return {
      success: response.success,
      connected: response.connected,
      message: response.message,
      error: response.error,
      kubernetesVersion: response.kubernetesVersion,
      nodeCount: response.nodeCount,
    };
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Failed to test cluster connection"));
  }
}

/**
 * Test connection with provided credentials (no saved cluster)
 */
export async function testClusterConnectionDirect(config: {
  apiServerUrl: string;
  authType: string;
  bearerToken?: string;
  clientCertificate?: string;
  clientKey?: string;
  caCertificate?: string;
  skipTlsVerify?: boolean;
  kubeconfig?: string;
}): Promise<{
  success: boolean;
  connected: boolean;
  message: string;
  error?: string;
  kubernetesVersion?: string;
  nodeCount?: number;
}> {
  try {
    const client = getK8sClusterClient();
    const request = create(TestConnectionDirectRequestSchema, {
      apiServerUrl: config.apiServerUrl,
      authType: config.authType,
      bearerToken: config.bearerToken,
      clientCertificate: config.clientCertificate,
      clientKey: config.clientKey,
      caCertificate: config.caCertificate,
      skipTlsVerify: config.skipTlsVerify ?? false,
      kubeconfig: config.kubeconfig,
    });
    const response = await client.testConnectionDirect(request);
    return {
      success: response.success,
      connected: response.connected,
      message: response.message,
      error: response.error,
      kubernetesVersion: response.kubernetesVersion,
      nodeCount: response.nodeCount,
    };
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Failed to test cluster connection"));
  }
}

/**
 * Set a cluster as default
 */
export async function setDefaultCluster(clusterId: string): Promise<K8sCluster> {
  try {
    const client = getK8sClusterClient();
    const request = create(SetDefaultClusterRequestSchema, { clusterId });
    const response = await client.setDefaultCluster(request);
    return clusterResponseToK8sCluster(response);
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Failed to set default cluster"));
  }
}

// ============================================================================
// Project API
// ============================================================================

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create a new project
 */
export async function createProject(name: string, description?: string): Promise<{ projectId: string; message: string }> {
  try {
    const client = getTestJobClient();
    const request = create(CreateProjectRequestSchema, {
      name,
      description,
    });
    const response = await client.createProject(request);
    return {
      projectId: response.projectId,
      message: response.message,
    };
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Failed to create project"));
  }
}

/**
 * Get a project by ID
 */
export async function getProject(projectId: string): Promise<Project> {
  try {
    const client = getTestJobClient();
    const request = create(GetProjectRequestSchema, { projectId });
    const response = await client.getProject(request);
    return {
      id: response.id,
      name: response.name,
      description: response.description,
      createdBy: response.createdBy,
      createdAt: response.createdAt ? timestampDate(response.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: response.updatedAt ? timestampDate(response.updatedAt).toISOString() : new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Failed to get project"));
  }
}

/**
 * List all projects
 */
export async function listProjects(page = 1, pageSize = 20): Promise<{ projects: Project[]; totalCount: number }> {
  try {
    const client = getTestJobClient();
    const request = create(ListProjectsRequestSchema, { page, pageSize });
    const response = await client.listProjects(request);
    return {
      projects: response.projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        createdBy: p.createdBy,
        createdAt: p.createdAt ? timestampDate(p.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: p.updatedAt ? timestampDate(p.updatedAt).toISOString() : new Date().toISOString(),
      })),
      totalCount: response.totalCount,
    };
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Failed to list projects"));
  }
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<{ success: boolean; message: string }> {
  try {
    const client = getTestJobClient();
    const request = create(DeleteProjectRequestSchema, { projectId });
    const response = await client.deleteProject(request);
    return {
      success: response.success,
      message: response.message,
    };
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Failed to delete project"));
  }
}
