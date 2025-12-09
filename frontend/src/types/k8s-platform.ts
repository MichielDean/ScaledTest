// K8s Test Platform Types
// These are re-exports and aliases for proto-generated types from gen/
// See gen/*.ts for the canonical protobuf-generated types

// Environment type for clusters
export type ClusterEnvironment = "dev" | "staging" | "prod" | "custom";
export type ClusterEnvironmentType = ClusterEnvironment; // Alias for backward compatibility

// Environment constants
export const EnvironmentDev: ClusterEnvironment = "dev";
export const EnvironmentStaging: ClusterEnvironment = "staging";
export const EnvironmentProd: ClusterEnvironment = "prod";
export const EnvironmentCustom: ClusterEnvironment = "custom";

// Backward compatible aliases
export const ClusterEnvironmentDev = EnvironmentDev;
export const ClusterEnvironmentStaging = EnvironmentStaging;
export const ClusterEnvironmentProd = EnvironmentProd;
export const ClusterEnvironmentCustom = EnvironmentCustom;

// Re-export Environment type alias
export type Environment = ClusterEnvironment;

// System under test configuration for same-cluster testing
export interface SutConfig {
  serviceName: string;
  namespace: string;
  port: number;
  protocol?: string;
}

// K8s cluster runner configuration
export interface RunnerConfig {
  platformApiUrl: string;
  defaultBaseUrl: string;
  serviceAccountName: string;
  artifactsPvcName?: string;
  defaultTimeout: number;
  defaultParallelism: number;
  defaultResources?: ResourceRequirements;
  nodeSelector?: Record<string, string>;
  imagePullPolicy: string;
}

// K8s cluster configuration (simplified for UI usage)
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
  environment: ClusterEnvironment;
  connectionStatus: string;
  connectionError?: string;
  lastConnectedAt?: Date;
  sutConfig?: SutConfig;
  runnerConfig?: RunnerConfig;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Request types for K8s cluster operations
export interface CreateK8sClusterRequest {
  name: string;
  description?: string;
  apiServerUrl: string;
  namespace: string;
  authType: string;
  bearerToken?: string;
  clientCertificate?: string;
  clientKey?: string;
  caCertificate?: string;
  skipTlsVerify?: boolean;
  kubeconfig?: string;
  isDefault?: boolean;
  projectId: string;
  environment?: ClusterEnvironment;
  sutConfig?: SutConfig;
  runnerConfig?: RunnerConfig;
}

export interface UpdateSutConfigRequest {
  serviceName: string;
  namespace: string;
  port: number;
  protocol?: string;
}

export interface UpdateSutConfigResponse {
  clusterId: string;
  sutConfig: SutConfig;
  internalUrl: string;
}

export interface UpdateRunnerConfigRequest {
  platformApiUrl?: string;
  defaultBaseUrl?: string;
  serviceAccountName?: string;
  artifactsPvcName?: string;
  defaultTimeout?: number;
  defaultParallelism?: number;
  defaultResources?: ResourceRequirements;
  nodeSelector?: Record<string, string>;
  imagePullPolicy?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  gitRepositoryUrl?: string;
  createdBy: string;
  organizationId?: string;
  defaultClusterId?: string;
  defaultTestEnvironment?: ClusterEnvironment;
  setupCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContainerRegistry {
  id: string;
  projectId: string;
  name: string;
  registryUrl: string;
  registryType: string;
  username?: string;
  authType: string;
  lastTestedAt?: Date;
  isVerified?: boolean;
  testStatus?: string;
  testError?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DiscoveredTest {
  id: string;
  name: string;
  suite?: string;
  file: string;
  tags?: string[];
}

export interface TestImage {
  id: string;
  projectId: string;
  registryId: string;
  imagePath: string;
  imageTag: string;
  imageDigest?: string;
  discoveryStatus: string;
  discoveryError?: string;
  framework?: string;
  frameworkVersion?: string;
  totalTestCount: number;
  discoveredTests?: DiscoveredTest[];
  lastDiscoveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestJob {
  id: string;
  projectId: string;
  testImageId: string;
  testRunId?: string;
  k8sJobName: string;
  k8sNamespace: string;
  testId: string;
  jobIndex: number;
  status: string;
  exitCode?: number;
  podName?: string;
  artifactVolumePath?: string;
  config?: Record<string, string>;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  createdAt: Date;
}

export interface JobStats {
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
}

export interface Artifact {
  id: string;
  jobId: string;
  artifactType: string;
  filePath: string;
  contentType?: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface ResourceRequirements {
  cpuRequest?: string;
  cpuLimit?: string;
  memoryRequest?: string;
  memoryLimit?: string;
}

export interface TriggerTestJobsRequest {
  projectId: string;
  testImageId: string;
  testIds: string[];
  environment?: Record<string, string>;
  resources?: ResourceRequirements;
  timeoutSeconds?: number;
  parallelism?: number;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  gitRepositoryUrl?: string;
  organizationId?: string;
}

export interface AddContainerRegistryRequest {
  projectId: string;
  name?: string;
  registryUrl: string;
  registryType: string;
  username: string;
  password: string;
  authType?: string;
}

export interface AddTestImageRequest {
  projectId: string;
  registryId: string;
  imagePath: string;
  imageTag: string;
  autoDiscover?: boolean;
}
