/**
 * API Context Provider
 *
 * Provides injectable API client and service instances via React Context.
 * This enables dependency injection for API services, making components
 * testable by allowing mock services to be injected during tests.
 *
 * Usage:
 *   // In App.tsx or test setup
 *   <ApiProvider>
 *     <App />
 *   </ApiProvider>
 *
 *   // In components
 *   const { apiClient, testResultsApi } = useApi();
 */

import React, { createContext, useContext, useMemo } from "react";
import { ApiClient, createApiClient } from "../lib/api";
import { authAPI } from "../lib/auth-api";
import type {
  TestRunDetails,
  UploadTestResultsRequest,
  ListTestResultsResponse,
  TestStatistics,
} from "../types";
import type { ApiResponse } from "../lib/api";

// ============================================================================
// API Service Interfaces
// ============================================================================

/**
 * Interface for test results API operations.
 * Implementations can be mocked for testing.
 */
export interface TestResultsApi {
  uploadTestResults(
    data: UploadTestResultsRequest,
  ): Promise<ApiResponse<{ id: string; message: string }>>;
  getTestResults(testRunId: string): Promise<ApiResponse<TestRunDetails>>;
  getTestRuns(
    page?: number,
    pageSize?: number,
  ): Promise<ApiResponse<ListTestResultsResponse>>;
  getTestStatistics(): Promise<ApiResponse<TestStatistics>>;
}

/**
 * Interface for user API operations.
 * Implementations can be mocked for testing.
 */
export interface UserApi {
  getUser(userId: string): Promise<ApiResponse<UserProfile>>;
  updateUser(
    userId: string,
    data: Partial<UserProfile>,
  ): Promise<ApiResponse<UserProfile>>;
  listUsers(
    page?: number,
    pageSize?: number,
  ): Promise<ApiResponse<ListUsersResponse>>;
}

/**
 * Interface for project API operations.
 */
export interface ProjectApi {
  createProject(data: CreateProjectRequest): Promise<ApiResponse<Project>>;
  getProject(projectId: string): Promise<ApiResponse<Project>>;
  listProjects(
    page?: number,
    pageSize?: number,
  ): Promise<ApiResponse<ListProjectsResponse>>;
  updateProject(
    projectId: string,
    data: Partial<CreateProjectRequest>,
  ): Promise<ApiResponse<Project>>;
  deleteProject(projectId: string): Promise<ApiResponse<void>>;
}

// ============================================================================
// Type Definitions
// ============================================================================

interface UserProfile {
  id: string;
  email: string;
  name?: string;
  role: string;
}

interface ListUsersResponse {
  users: UserProfile[];
  total_count: number;
  page: number;
  page_size: number;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  git_repository_url?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface CreateProjectRequest {
  name: string;
  description?: string;
  git_repository_url?: string;
}

interface ListProjectsResponse {
  projects: Project[];
  total_count: number;
  page: number;
  page_size: number;
}

// ============================================================================
// API Context
// ============================================================================

interface ApiContextType {
  /** The raw API client for custom requests */
  apiClient: ApiClient;

  /** Test results API service */
  testResultsApi: TestResultsApi;

  /** User API service */
  userApi: UserApi;

  /** Project API service */
  projectApi: ProjectApi;
}

const ApiContext = createContext<ApiContextType | undefined>(undefined);

// ============================================================================
// Default API Implementations
// ============================================================================

/**
 * Creates the default TestResultsApi implementation using the API client.
 */
const createTestResultsApi = (client: ApiClient): TestResultsApi => ({
  uploadTestResults: (data) => client.uploadTestResults(data),
  getTestResults: (testRunId) => client.getTestResults(testRunId),
  getTestRuns: (page = 1, pageSize = 20) => client.getTestRuns(page, pageSize),
  getTestStatistics: () => client.getTestStatistics(),
});

/**
 * Creates the default UserApi implementation using the API client.
 */
const createUserApi = (client: ApiClient): UserApi => ({
  getUser: (userId) => client.get<UserProfile>(`/api/v1/users/${userId}`),
  updateUser: (userId, data) =>
    client.put<UserProfile>(`/api/v1/users/${userId}`, data),
  listUsers: (page = 1, pageSize = 20) =>
    client.get<ListUsersResponse>(
      `/api/v1/users?page=${page}&page_size=${pageSize}`,
    ),
});

/**
 * Creates the default ProjectApi implementation using the API client.
 */
const createProjectApi = (client: ApiClient): ProjectApi => ({
  createProject: (data) => client.post<Project>("/api/v1/projects", data),
  getProject: (projectId) =>
    client.get<Project>(`/api/v1/projects/${projectId}`),
  listProjects: (page = 1, pageSize = 20) =>
    client.get<ListProjectsResponse>(
      `/api/v1/projects?page=${page}&page_size=${pageSize}`,
    ),
  updateProject: (projectId, data) =>
    client.put<Project>(`/api/v1/projects/${projectId}`, data),
  deleteProject: (projectId) =>
    client.delete<void>(`/api/v1/projects/${projectId}`),
});

// ============================================================================
// Provider Component
// ============================================================================

interface ApiProviderProps {
  children: React.ReactNode;
  /**
   * Optional custom API client. If not provided, uses default client with authAPI.
   * Useful for testing with mock clients.
   */
  apiClient?: ApiClient;
  /**
   * Optional custom test results API. If not provided, uses default implementation.
   * Useful for testing with mock services.
   */
  testResultsApi?: TestResultsApi;
  /**
   * Optional custom user API. If not provided, uses default implementation.
   */
  userApi?: UserApi;
  /**
   * Optional custom project API. If not provided, uses default implementation.
   */
  projectApi?: ProjectApi;
}

/**
 * Provider component that makes API services available throughout the app.
 *
 * @example
 * // Default usage
 * <ApiProvider>
 *   <App />
 * </ApiProvider>
 *
 * @example
 * // With mock services for testing
 * <ApiProvider testResultsApi={mockTestResultsApi}>
 *   <ComponentUnderTest />
 * </ApiProvider>
 */
export const ApiProvider: React.FC<ApiProviderProps> = ({
  children,
  apiClient: customApiClient,
  testResultsApi: customTestResultsApi,
  userApi: customUserApi,
  projectApi: customProjectApi,
}) => {
  const value = useMemo(() => {
    // Use custom client or create default
    const client =
      customApiClient ?? createApiClient(() => authAPI.getAccessToken());

    // Use custom services or create defaults
    const testResultsApi = customTestResultsApi ?? createTestResultsApi(client);
    const userApi = customUserApi ?? createUserApi(client);
    const projectApi = customProjectApi ?? createProjectApi(client);

    return {
      apiClient: client,
      testResultsApi,
      userApi,
      projectApi,
    };
  }, [customApiClient, customTestResultsApi, customUserApi, customProjectApi]);

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
};

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access API services from any component.
 *
 * @throws Error if used outside of ApiProvider
 *
 * @example
 * const { testResultsApi } = useApi();
 * const { data, error } = await testResultsApi.getTestRuns();
 */
export const useApi = (): ApiContextType => {
  const context = useContext(ApiContext);
  if (context === undefined) {
    throw new Error("useApi must be used within an ApiProvider");
  }
  return context;
};

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook to access just the test results API.
 */
export const useTestResultsApi = (): TestResultsApi => {
  const { testResultsApi } = useApi();
  return testResultsApi;
};

/**
 * Hook to access just the user API.
 */
export const useUserApi = (): UserApi => {
  const { userApi } = useApi();
  return userApi;
};

/**
 * Hook to access just the project API.
 */
export const useProjectApi = (): ProjectApi => {
  const { projectApi } = useApi();
  return projectApi;
};

/**
 * Hook to access the raw API client for custom requests.
 */
export const useApiClient = (): ApiClient => {
  const { apiClient } = useApi();
  return apiClient;
};
