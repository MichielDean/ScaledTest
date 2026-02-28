/**
 * Tests for ExecutionsView component (TDD — written before implementation)
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock SPANavigationContext
jest.mock('../../src/contexts/SPANavigationContext', () => ({
  useSPANavigation: jest.fn(() => ({
    navigateTo: jest.fn(),
    currentView: 'executions',
  })),
}));

// Mock useAuth
jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

import { useAuth } from '../../src/hooks/useAuth';
import ExecutionsView from '../../src/components/views/ExecutionsView';

const mockUseAuth = useAuth as jest.Mock;

function setupAuth(role: 'owner' | 'maintainer' | 'readonly', token = 'mock-token') {
  mockUseAuth.mockReturnValue({
    user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role },
    isAuthenticated: true,
    loading: false,
    error: null,
    userProfile: null,
    login: jest.fn(),
    logout: jest.fn(),
    hasRole: (r: string) => {
      const hierarchy: Record<string, number> = { readonly: 1, maintainer: 2, owner: 3 };
      return (hierarchy[role] ?? 0) >= (hierarchy[r] ?? 999);
    },
    hasPermission: jest.fn(() => false),
    getUserTeams: jest.fn(() => []),
    token,
    initialized: true,
  });
}

const fakeExecution = {
  id: 'exec-abc-123-456',
  status: 'completed',
  dockerImage: 'node:20',
  testCommand: 'npm test',
  parallelism: 2,
  environmentVars: {},
  resourceLimits: {},
  requestedBy: 'user-1',
  teamId: null,
  startedAt: '2024-01-01T00:00:00.000Z',
  completedAt: '2024-01-01T00:01:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:01:00.000Z',
  kubernetesJobName: 'scaledtest-exec-abc',
  kubernetesNamespace: 'scaledtest',
  errorMessage: null,
  totalPods: 2,
  completedPods: 2,
  failedPods: 0,
};

describe('ExecutionsView', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders "No executions yet" when list is empty', async () => {
    setupAuth('readonly');
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [], total: 0 }),
    } as Response);

    await act(async () => {
      render(<ExecutionsView />);
    });

    await waitFor(() => {
      expect(screen.getByText(/no executions yet/i)).toBeInTheDocument();
    });
  });

  it('renders execution rows with status badges', async () => {
    setupAuth('readonly');
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [fakeExecution], total: 1 }),
    } as Response);

    await act(async () => {
      render(<ExecutionsView />);
    });

    await waitFor(() => {
      // ID should be first 8 chars
      expect(screen.getByText('exec-abc')).toBeInTheDocument();
      // Status badge
      expect(screen.getByText('completed')).toBeInTheDocument();
      // Docker image
      expect(screen.getByText('node:20')).toBeInTheDocument();
    });
  });

  it('"Run Tests" button is only visible for maintainer+', async () => {
    // readonly should NOT see the button
    setupAuth('readonly');
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [], total: 0 }),
    } as Response);

    const { unmount } = await act(async () => render(<ExecutionsView />));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /run tests/i })).not.toBeInTheDocument();
    });

    unmount();
    jest.clearAllMocks();

    // maintainer SHOULD see the button
    setupAuth('maintainer');
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [], total: 0 }),
    } as Response);

    await act(async () => render(<ExecutionsView />));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /run tests/i })).toBeInTheDocument();
    });
  });

  it('cancel confirm dialog appears and calls DELETE on confirm', async () => {
    setupAuth('owner');
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [{ ...fakeExecution, status: 'queued' }],
          total: 1,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { ...fakeExecution, status: 'cancelled' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [], total: 0 }),
      } as Response);

    await act(async () => {
      render(<ExecutionsView />);
    });

    await waitFor(() => {
      expect(screen.getByText('exec-abc')).toBeInTheDocument();
    });

    // Find and click Cancel button
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    await act(async () => {
      userEvent.click(cancelBtn);
    });

    // Confirm dialog should appear
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    // Click Confirm
    const confirmBtn = screen.getByRole('button', { name: /confirm|yes|cancel execution/i });
    await act(async () => {
      userEvent.click(confirmBtn);
    });

    await waitFor(() => {
      const deleteCalls = fetchSpy.mock.calls.filter(
        (call: unknown[]) =>
          (typeof call[0] === 'string' && call[0].includes(fakeExecution.id)) ||
          (call[1] as { method?: string })?.method === 'DELETE'
      );
      expect(deleteCalls.length).toBeGreaterThan(0);
    });
  });
});
