/**
 * Example Tests Demonstrating Dependency Injection with Vitest
 *
 * These tests show how to use the mock factories and test utilities
 * to test React components with injected API dependencies.
 */

import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderWithProviders,
  createMockProjectApi,
  createMockUserApi,
  fixtures,
} from '../utils/test-utils';
import { useApi } from '../../contexts/ApiContext';
import React, { useEffect, useState } from 'react';

// ============================================================================
// Example Component Using Injected API
// ============================================================================

interface Project {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/**
 * Example component that lists projects using the injected API.
 */
function ProjectList() {
  const { projectApi } = useApi();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setIsLoading(true);
        const response = await projectApi.listProjects();
        if (response.error) {
          setError(response.error);
        } else if (response.data) {
          setProjects(response.data.projects || []);
        }
      } catch {
        setError('Failed to fetch projects');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, [projectApi]);

  if (isLoading) return <div>Loading projects...</div>;
  if (error) return <div>Error: {error}</div>;
  if (projects.length === 0) return <div>No projects found</div>;

  return (
    <ul>
      {projects.map((project) => (
        <li key={project.id} data-testid={`project-${project.id}`}>
          {project.name}
        </li>
      ))}
    </ul>
  );
}

/**
 * Example component that creates a project using the injected API.
 */
function CreateProjectForm({ onSuccess }: { onSuccess?: () => void }) {
  const { projectApi } = useApi();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setIsSubmitting(true);
      setError(null);
      const response = await projectApi.createProject({ name });
      
      if (response.error) {
        setError(response.error);
      } else {
        setSuccess(true);
        setName('');
        onSuccess?.();
      }
    } catch {
      setError('Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        data-testid="project-name-input"
        disabled={isSubmitting}
      />
      <button type="submit" disabled={isSubmitting} data-testid="submit-button">
        {isSubmitting ? 'Creating...' : 'Create Project'}
      </button>
      {error && <div data-testid="error-message">{error}</div>}
      {success && <div data-testid="success-message">Project created!</div>}
    </form>
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('ProjectList Component', () => {
  it('displays loading state initially', () => {
    renderWithProviders(<ProjectList />);
    expect(screen.getByText('Loading projects...')).toBeInTheDocument();
  });

  it('displays projects from API', async () => {
    // Arrange - Create mock with specific projects
    const mockProjectApi = createMockProjectApi({
      listProjects: vi.fn().mockResolvedValue({
        data: {
          projects: [
            { ...fixtures.project, id: '1', name: 'Project Alpha' },
            { ...fixtures.project, id: '2', name: 'Project Beta' },
          ],
          total_count: 2,
          page: 1,
          page_size: 20,
        },
      }),
    });

    // Act
    renderWithProviders(<ProjectList />, { projectApi: mockProjectApi });

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      expect(screen.getByText('Project Beta')).toBeInTheDocument();
    });

    expect(mockProjectApi.listProjects).toHaveBeenCalledTimes(1);
  });

  it('displays error message on API failure', async () => {
    // Arrange
    const mockProjectApi = createMockProjectApi({
      listProjects: vi.fn().mockResolvedValue({
        error: 'Server error',
      }),
    });

    // Act
    renderWithProviders(<ProjectList />, { projectApi: mockProjectApi });

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Error: Server error')).toBeInTheDocument();
    });
  });

  it('displays empty state when no projects exist', async () => {
    // Arrange
    const mockProjectApi = createMockProjectApi({
      listProjects: vi.fn().mockResolvedValue({
        data: {
          projects: [],
          total_count: 0,
          page: 1,
          page_size: 20,
        },
      }),
    });

    // Act
    renderWithProviders(<ProjectList />, { projectApi: mockProjectApi });

    // Assert
    await waitFor(() => {
      expect(screen.getByText('No projects found')).toBeInTheDocument();
    });
  });
});

describe('CreateProjectForm Component', () => {
  it('creates project on form submission', async () => {
    // Arrange
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const mockProjectApi = createMockProjectApi({
      createProject: vi.fn().mockResolvedValue({
        data: { ...fixtures.project, name: 'New Project' },
      }),
    });

    // Act
    renderWithProviders(<CreateProjectForm onSuccess={onSuccess} />, {
      projectApi: mockProjectApi,
    });

    await user.type(screen.getByTestId('project-name-input'), 'New Project');
    await user.click(screen.getByTestId('submit-button'));

    // Assert
    await waitFor(() => {
      expect(screen.getByTestId('success-message')).toBeInTheDocument();
    });

    expect(mockProjectApi.createProject).toHaveBeenCalledWith({
      name: 'New Project',
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('displays error on API failure', async () => {
    // Arrange
    const user = userEvent.setup();
    const mockProjectApi = createMockProjectApi({
      createProject: vi.fn().mockResolvedValue({
        error: 'Project name already exists',
      }),
    });

    // Act
    renderWithProviders(<CreateProjectForm />, { projectApi: mockProjectApi });

    await user.type(screen.getByTestId('project-name-input'), 'Duplicate');
    await user.click(screen.getByTestId('submit-button'));

    // Assert
    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toHaveTextContent(
        'Project name already exists'
      );
    });
  });

  it('disables submit button while submitting', async () => {
    // Arrange
    const user = userEvent.setup();
    let resolvePromise: (value: unknown) => void;
    const mockProjectApi = createMockProjectApi({
      createProject: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve;
          })
      ),
    });

    // Act
    renderWithProviders(<CreateProjectForm />, { projectApi: mockProjectApi });

    await user.type(screen.getByTestId('project-name-input'), 'Test');
    await user.click(screen.getByTestId('submit-button'));

    // Assert - button should be disabled during submission
    expect(screen.getByTestId('submit-button')).toBeDisabled();
    expect(screen.getByTestId('submit-button')).toHaveTextContent('Creating...');

    // Cleanup - resolve the promise
    await act(async () => {
      resolvePromise!({ data: fixtures.project });
    });

    await waitFor(() => {
      expect(screen.getByTestId('submit-button')).not.toBeDisabled();
    });
  });

  it('does not submit empty project name', async () => {
    // Arrange
    const user = userEvent.setup();
    const mockProjectApi = createMockProjectApi();

    // Act
    renderWithProviders(<CreateProjectForm />, { projectApi: mockProjectApi });

    // Try to submit without entering a name
    await user.click(screen.getByTestId('submit-button'));

    // Assert - API should not be called
    expect(mockProjectApi.createProject).not.toHaveBeenCalled();
  });
});

describe('API Mock Factory Verification', () => {
  it('mock factory creates working stubs', async () => {
    // Verify that the mock factories create proper mock objects
    const projectApi = createMockProjectApi();
    const userApi = createMockUserApi();

    // Verify methods are mocked
    expect(vi.isMockFunction(projectApi.createProject)).toBe(true);
    expect(vi.isMockFunction(projectApi.getProject)).toBe(true);
    expect(vi.isMockFunction(userApi.getUser)).toBe(true);

    // Verify default return values
    const projectResponse = await projectApi.getProject('test-id');
    expect(projectResponse.data).toBeDefined();
    expect(projectResponse.data?.id).toBe('project-1');

    const userResponse = await userApi.getUser('user-id');
    expect(userResponse.data).toBeDefined();
    expect(userResponse.data?.email).toBe('test@example.com');
  });

  it('mock factory allows overriding specific methods', async () => {
    // Create mock with custom implementation
    const customProject = {
      id: 'custom-123',
      name: 'Custom Project',
      created_by: 'user-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const projectApi = createMockProjectApi({
      getProject: vi.fn().mockResolvedValue({ data: customProject }),
    });

    // Verify custom implementation
    const response = await projectApi.getProject('any-id');
    expect(response.data?.id).toBe('custom-123');
    expect(response.data?.name).toBe('Custom Project');

    // Other methods still have defaults
    const listResponse = await projectApi.listProjects();
    expect(listResponse.data?.projects).toEqual([]);
  });
});
