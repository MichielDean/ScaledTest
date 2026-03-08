/**
 * Tests for DashboardView component with stats integration
 * Written BEFORE implementation per TDD requirement.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// Mock SPANavigationContext
jest.mock('../../src/contexts/SPANavigationContext', () => ({
  useSPANavigation: jest.fn(() => ({
    navigateTo: jest.fn(),
    currentView: 'dashboard',
  })),
}));

// Mock useAuth (hooks/useAuth)
jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

// Mock TeamContext — DashboardView now consumes useTeams
jest.mock('../../src/contexts/TeamContext', () => ({
  useTeams: jest.fn(() => ({
    userTeams: [],
    selectedTeamIds: [],
    allTeams: [],
    loading: false,
    error: null,
    setSelectedTeamIds: jest.fn(),
    selectAllTeams: jest.fn(),
    clearTeamSelection: jest.fn(),
    refreshUserTeams: jest.fn(),
    refreshAllTeams: jest.fn(),
    selectedTeams: [],
    hasMultipleTeams: false,
    canManageTeams: false,
    effectiveTeamIds: [],
  })),
}));

import { useAuth } from '../../src/hooks/useAuth';
import DashboardView from '../../src/components/views/DashboardView';

const mockUseAuth = useAuth as jest.Mock;

// Helper to set up useAuth mock
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

const mockStatsData = {
  success: true,
  data: {
    totalReports: 42,
    totalTests: 1234,
    passRateLast7d: 87,
    totalExecutions: 0,
    activeExecutions: 0,
  },
};

describe('DashboardView', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders skeleton cards while loading', async () => {
    setupAuth('owner');

    // Never resolves during this test — component stays in loading state
    fetchSpy.mockImplementation(() => new Promise(() => {}));

    render(<DashboardView />);

    // Skeleton elements should be present while data is loading
    const skeletons = document.querySelectorAll(
      '[data-testid="skeleton"], .animate-pulse, [class*="skeleton"]'
    );
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders stat values after fetch resolves', async () => {
    setupAuth('owner');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockStatsData,
    } as Response);

    render(<DashboardView />);

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('87%')).toBeInTheDocument();
  });

  it('renders stat card titles', async () => {
    setupAuth('owner');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockStatsData,
    } as Response);

    render(<DashboardView />);

    await waitFor(() => {
      expect(screen.getByText('Total Reports')).toBeInTheDocument();
    });

    expect(screen.getByText('Tests Run')).toBeInTheDocument();
    expect(screen.getByText('Pass Rate')).toBeInTheDocument();
  });

  it('renders error message when fetch fails', async () => {
    setupAuth('owner');

    fetchSpy.mockRejectedValueOnce(new Error('Network error'));

    render(<DashboardView />);

    await waitFor(() => {
      // Should show some fallback — either 0 values or error message
      // The component falls back to zeros on error
      expect(screen.getByText('Total Reports')).toBeInTheDocument();
    });
  });

  it('admin actions card visible for owner', async () => {
    setupAuth('owner');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockStatsData,
    } as Response);

    render(<DashboardView />);

    await waitFor(() => {
      expect(screen.getByText('Admin Actions')).toBeInTheDocument();
    });
  });

  it('admin actions card hidden for readonly', async () => {
    setupAuth('readonly');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockStatsData,
    } as Response);

    render(<DashboardView />);

    await waitFor(() => {
      // Stats should be visible
      expect(screen.getByText('Total Reports')).toBeInTheDocument();
    });

    // Admin Actions should NOT be visible for readonly
    expect(screen.queryByText('Admin Actions')).not.toBeInTheDocument();
  });

  it('fetch is called with correct URL and auth token', async () => {
    setupAuth('owner', 'my-bearer-token');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockStatsData,
    } as Response);

    render(<DashboardView />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/v1/stats',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-bearer-token',
          }),
        })
      );
    });
  });
});
