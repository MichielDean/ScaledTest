/**
 * Test Utilities and Mock Factories
 *
 * Provides utility functions for creating mock API services,
 * test wrappers, and common test data fixtures.
 */

import { ReactElement, ReactNode } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import {
  ApiProvider,
  TestResultsApi,
  UserApi,
  ProjectApi,
} from "../../contexts/ApiContext";
import type { ApiResponse } from "../../lib/api";

// ============================================================================
// Mock API Factories
// ============================================================================

/**
 * Creates a mock TestResultsApi with all methods stubbed.
 * Override specific methods as needed in tests.
 */
export const createMockTestResultsApi = (
  overrides: Partial<TestResultsApi> = {},
): TestResultsApi => ({
  uploadTestResults: vi
    .fn()
    .mockResolvedValue({ data: { id: "test-run-1", message: "Uploaded" } }),
  getTestResults: vi.fn().mockResolvedValue({
    data: {
      id: "test-run-1",
      branch: "main",
      commit_sha: "abc123",
      status: "completed",
      total_tests: 10,
      passed_tests: 8,
      failed_tests: 2,
      tests: [],
      created_at: new Date().toISOString(),
    },
  }),
  getTestRuns: vi.fn().mockResolvedValue({
    data: {
      results: [],
      total_count: 0,
      page: 1,
      page_size: 20,
    },
  }),
  getTestStatistics: vi.fn().mockResolvedValue({
    data: {
      total_runs: 0,
      total_tests: 0,
      pass_rate: 0,
      avg_duration_ms: 0,
    },
  }),
  ...overrides,
});

/**
 * Creates a mock UserApi with all methods stubbed.
 */
export const createMockUserApi = (
  overrides: Partial<UserApi> = {},
): UserApi => ({
  getUser: vi.fn().mockResolvedValue({
    data: {
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      role: "user",
    },
  }),
  updateUser: vi.fn().mockResolvedValue({
    data: {
      id: "user-1",
      email: "test@example.com",
      name: "Updated User",
      role: "user",
    },
  }),
  listUsers: vi.fn().mockResolvedValue({
    data: {
      users: [],
      total_count: 0,
      page: 1,
      page_size: 20,
    },
  }),
  ...overrides,
});

/**
 * Creates a mock ProjectApi with all methods stubbed.
 */
export const createMockProjectApi = (
  overrides: Partial<ProjectApi> = {},
): ProjectApi => ({
  createProject: vi.fn().mockResolvedValue({
    data: {
      id: "project-1",
      name: "Test Project",
      created_by: "user-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  }),
  getProject: vi.fn().mockResolvedValue({
    data: {
      id: "project-1",
      name: "Test Project",
      created_by: "user-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  }),
  listProjects: vi.fn().mockResolvedValue({
    data: {
      projects: [],
      total_count: 0,
      page: 1,
      page_size: 20,
    },
  }),
  updateProject: vi.fn().mockResolvedValue({
    data: {
      id: "project-1",
      name: "Updated Project",
      created_by: "user-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  }),
  deleteProject: vi.fn().mockResolvedValue({ data: undefined }),
  ...overrides,
});

/**
 * Helper to create a successful API response.
 */
export function successResponse<T>(data: T): ApiResponse<T> {
  return { data };
}

/**
 * Helper to create an error API response.
 */
export function errorResponse<T>(error: string): ApiResponse<T> {
  return { error };
}

// ============================================================================
// Test Wrapper Component
// ============================================================================

interface TestWrapperProps {
  children: ReactNode;
  testResultsApi?: TestResultsApi;
  userApi?: UserApi;
  projectApi?: ProjectApi;
}

/**
 * Wrapper component that provides all necessary context providers for testing.
 * Use this to wrap components that need access to routing, queries, or API context.
 */
export function TestWrapper({
  children,
  testResultsApi = createMockTestResultsApi(),
  userApi = createMockUserApi(),
  projectApi = createMockProjectApi(),
}: TestWrapperProps): ReactElement {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ApiProvider
          testResultsApi={testResultsApi}
          userApi={userApi}
          projectApi={projectApi}
        >
          {children}
        </ApiProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

// ============================================================================
// Custom Render Function
// ============================================================================

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  testResultsApi?: TestResultsApi;
  userApi?: UserApi;
  projectApi?: ProjectApi;
}

/**
 * Custom render function that wraps components with all necessary providers.
 *
 * @example
 * const { getByText } = renderWithProviders(<MyComponent />, {
 *   testResultsApi: createMockTestResultsApi({
 *     getTestRuns: vi.fn().mockResolvedValue({ data: { results: [...] } })
 *   })
 * });
 */
export function renderWithProviders(
  ui: ReactElement,
  options: CustomRenderOptions = {},
) {
  const { testResultsApi, userApi, projectApi, ...renderOptions } = options;

  function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return (
      <TestWrapper
        testResultsApi={testResultsApi}
        userApi={userApi}
        projectApi={projectApi}
      >
        {children}
      </TestWrapper>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

// ============================================================================
// Test Data Fixtures
// ============================================================================

export const fixtures = {
  user: {
    id: "user-123",
    email: "test@example.com",
    name: "Test User",
    role: "user" as const,
  },
  adminUser: {
    id: "admin-123",
    email: "admin@example.com",
    name: "Admin User",
    role: "admin" as const,
  },
  project: {
    id: "project-123",
    name: "Test Project",
    description: "A test project",
    created_by: "user-123",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  testRun: {
    id: "run-123",
    branch: "main",
    commit_sha: "abc123def456",
    status: "completed",
    total_tests: 100,
    passed_tests: 95,
    failed_tests: 5,
    skipped_tests: 0,
    duration_ms: 30000,
    created_at: "2024-01-01T00:00:00Z",
  },
};
