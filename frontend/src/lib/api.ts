import type {
  TestRunDetails,
  UploadTestResultsRequest,
  ListTestResultsResponse,
  TestStatistics,
} from "../types";

// In production/K8s, use empty string so browser uses relative URLs via nginx proxy
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export class ApiClient {
  private baseUrl: string;
  private getAuthToken: () => string | null;

  constructor(baseUrl: string, getAuthToken: () => string | null) {
    this.baseUrl = baseUrl;
    this.getAuthToken = getAuthToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    const token = this.getAuthToken();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Merge any custom headers
    if (options.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        if (typeof value === "string") {
          headers[key] = value;
        }
      });
    }

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          error: "An error occurred",
        }));
        return { error: error.error || error.message || "Request failed" };
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Network error",
      };
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }

  // Test results API methods
  async uploadTestResults(
    data: UploadTestResultsRequest,
  ): Promise<ApiResponse<{ id: string; message: string }>> {
    return this.post<{ id: string; message: string }>(
      "/api/v1/test-results",
      data,
    );
  }

  async getTestResults(
    testRunId: string,
  ): Promise<ApiResponse<TestRunDetails>> {
    return this.get<TestRunDetails>(`/api/v1/test-results/${testRunId}`);
  }

  async getTestRuns(
    page = 1,
    pageSize = 20,
  ): Promise<ApiResponse<ListTestResultsResponse>> {
    return this.get<ListTestResultsResponse>(
      `/api/v1/test-results?page=${page}&page_size=${pageSize}`,
    );
  }

  async getTestStatistics(): Promise<ApiResponse<TestStatistics>> {
    return this.get<TestStatistics>(`/api/v1/test-statistics`);
  }
}

export const createApiClient = (getAuthToken: () => string | null) => {
  return new ApiClient(API_BASE_URL, getAuthToken);
};
