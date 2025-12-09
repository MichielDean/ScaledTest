import { ApiClient } from "./api";
import type {
  Project,
  ContainerRegistry,
  TestImage,
  TestJob,
  JobStats,
  Artifact,
  CreateProjectRequest,
  AddContainerRegistryRequest,
  AddTestImageRequest,
  TriggerTestJobsRequest,
  DiscoveredTest,
  K8sCluster,
  CreateK8sClusterRequest,
  UpdateSutConfigRequest,
  UpdateSutConfigResponse,
  UpdateRunnerConfigRequest,
  RunnerConfig,
  ClusterEnvironment,
} from "../types/k8s-platform";

export class K8sPlatformApi {
  constructor(private client: ApiClient) {}

  // Project APIs
  async createProject(data: CreateProjectRequest) {
    return this.client.post<{ project_id: string; message: string }>(
      "/api/v1/projects",
      data,
    );
  }

  async getProject(projectId: string) {
    return this.client.get<Project>(`/api/v1/projects/${projectId}`);
  }

  async listProjects(page = 1, pageSize = 20) {
    return this.client.get<{ projects: Project[]; total_count: number }>(
      `/api/v1/projects?page=${page}&page_size=${pageSize}`,
    );
  }

  async updateProject(projectId: string, data: Partial<CreateProjectRequest>) {
    return this.client.put<Project>(`/api/v1/projects/${projectId}`, data);
  }

  async deleteProject(projectId: string) {
    return this.client.delete<{ success: boolean; message: string }>(
      `/api/v1/projects/${projectId}`,
    );
  }

  // Container Registry APIs
  async addContainerRegistry(data: AddContainerRegistryRequest) {
    return this.client.post<ContainerRegistry>("/api/v1/registries", data);
  }

  async getContainerRegistry(registryId: string) {
    return this.client.get<ContainerRegistry>(
      `/api/v1/registries/${registryId}`,
    );
  }

  async listContainerRegistries(projectId: string, page = 1, pageSize = 20) {
    return this.client.get<{
      registries: ContainerRegistry[];
      total_count: number;
    }>(
      `/api/v1/registries?project_id=${projectId}&page=${page}&page_size=${pageSize}`,
    );
  }

  async updateContainerRegistry(
    registryId: string,
    data: Partial<AddContainerRegistryRequest>,
  ) {
    return this.client.put<ContainerRegistry>(
      `/api/v1/registries/${registryId}`,
      data,
    );
  }

  async deleteContainerRegistry(registryId: string) {
    return this.client.delete<{ success: boolean; message: string }>(
      `/api/v1/registries/${registryId}`,
    );
  }

  async testRegistryConnection(registryId: string) {
    return this.client.post<{
      success: boolean;
      message: string;
      tested_at: string;
    }>(`/api/v1/registries/${registryId}/test`);
  }

  // Test Image APIs
  async addTestImage(data: AddTestImageRequest) {
    return this.client.post<TestImage>("/api/v1/test-images", data);
  }

  async getTestImage(imageId: string) {
    return this.client.get<TestImage>(`/api/v1/test-images/${imageId}`);
  }

  async listTestImages(
    projectId: string,
    page = 1,
    pageSize = 20,
    filters?: { framework?: string; discovery_status?: string },
  ) {
    const params = new URLSearchParams({
      project_id: projectId,
      page: page.toString(),
      page_size: pageSize.toString(),
      ...(filters?.framework && { framework: filters.framework }),
      ...(filters?.discovery_status && {
        discovery_status: filters.discovery_status,
      }),
    });

    return this.client.get<{ images: TestImage[]; total_count: number }>(
      `/api/v1/test-images?${params.toString()}`,
    );
  }

  async deleteTestImage(imageId: string) {
    return this.client.delete<{ success: boolean; message: string }>(
      `/api/v1/test-images/${imageId}`,
    );
  }

  async discoverTests(imageId: string) {
    return this.client.post<{
      success: boolean;
      message: string;
      test_count: number;
      tests: DiscoveredTest[];
    }>(`/api/v1/test-images/${imageId}/discover`);
  }

  // Test Job APIs
  async triggerTestJobs(data: TriggerTestJobsRequest) {
    return this.client.post<{
      success: boolean;
      message: string;
      k8s_job_name: string;
      job_ids: string[];
      total_tests: number;
    }>("/api/v1/test-jobs/trigger", data);
  }

  async getTestJob(jobId: string) {
    return this.client.get<TestJob>(`/api/v1/test-jobs/${jobId}`);
  }

  async listTestJobs(
    projectId: string,
    page = 1,
    pageSize = 20,
    filters?: {
      status?: string;
      test_image_id?: string;
      k8s_job_name?: string;
    },
  ) {
    const params = new URLSearchParams({
      project_id: projectId,
      page: page.toString(),
      page_size: pageSize.toString(),
      ...(filters?.status && { status: filters.status }),
      ...(filters?.test_image_id && { test_image_id: filters.test_image_id }),
      ...(filters?.k8s_job_name && { k8s_job_name: filters.k8s_job_name }),
    });

    return this.client.get<{
      jobs: TestJob[];
      total_count: number;
      stats?: JobStats;
    }>(`/api/v1/test-jobs?${params.toString()}`);
  }

  async cancelTestJob(jobId: string) {
    return this.client.post<{ success: boolean; message: string }>(
      `/api/v1/test-jobs/${jobId}/cancel`,
    );
  }

  async getTestJobLogs(jobId: string, tailLines = 100) {
    return this.client.get<string>(
      `/api/v1/test-jobs/${jobId}/logs?tail_lines=${tailLines}`,
    );
  }

  // Artifact APIs
  async listArtifacts(jobId: string, artifactType?: string) {
    const params = artifactType ? `?artifact_type=${artifactType}` : "";
    return this.client.get<{
      artifacts: Artifact[];
      total_count: number;
      total_size_bytes: number;
    }>(`/api/v1/test-jobs/${jobId}/artifacts${params}`);
  }

  async getArtifactDownloadUrl(artifactId: string, expiresIn = 3600) {
    return this.client.get<{ download_url: string; expires_at: string }>(
      `/api/v1/artifacts/${artifactId}/download-url?expires_in_seconds=${expiresIn}`,
    );
  }

  // K8s Cluster APIs
  async createCluster(data: CreateK8sClusterRequest) {
    return this.client.post<K8sCluster>("/api/v1/k8s/clusters", data);
  }

  async getCluster(clusterId: string) {
    return this.client.get<K8sCluster>(`/api/v1/k8s/clusters/${clusterId}`);
  }

  async listClusters(
    projectId: string,
    environment?: ClusterEnvironment,
    page = 1,
    pageSize = 20,
  ) {
    const params = new URLSearchParams({
      project_id: projectId,
      page: page.toString(),
      page_size: pageSize.toString(),
    });

    if (environment) {
      params.set("environment", environment);
    }

    return this.client.get<{ clusters: K8sCluster[]; total_count: number }>(
      `/api/v1/k8s/clusters?${params.toString()}`,
    );
  }

  async deleteCluster(clusterId: string) {
    return this.client.delete<{ success: boolean; message: string }>(
      `/api/v1/k8s/clusters/${clusterId}`,
    );
  }

  async setDefaultCluster(clusterId: string) {
    return this.client.post<{ success: boolean; message: string }>(
      `/api/v1/k8s/clusters/${clusterId}/set-default`,
    );
  }

  async testClusterConnection(clusterId: string) {
    return this.client.post<{
      success: boolean;
      message: string;
      server_version?: string;
    }>(`/api/v1/k8s/clusters/${clusterId}/test-connection`);
  }

  async testClusterConnectionDirect(data: {
    api_server_url: string;
    credentials: string;
    auth_type: "kubeconfig" | "service_account" | "oidc";
  }) {
    return this.client.post<{
      success: boolean;
      message: string;
      server_version?: string;
    }>("/api/v1/k8s/clusters/test-connection", data);
  }

  async updateClusterRunnerConfig(
    clusterId: string,
    config: UpdateRunnerConfigRequest,
  ) {
    return this.client.patch<{ cluster_id: string; runner_config: RunnerConfig }>(
      `/api/v1/k8s/clusters/${clusterId}/runner-config`,
      config,
    );
  }

  async updateClusterSutConfig(clusterId: string, config: UpdateSutConfigRequest) {
    return this.client.patch<UpdateSutConfigResponse>(
      `/api/v1/k8s/clusters/${clusterId}/sut-config`,
      config,
    );
  }
}

export const createK8sPlatformApi = (client: ApiClient) => {
  return new K8sPlatformApi(client);
};
