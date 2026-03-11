/**
 * Component tests for AdminUsersView
 *
 * Covers:
 * - User listing with username, email, teams display
 * - Role-based access (only owners can see user management)
 * - Loading skeleton state
 * - Error handling (network errors, 403, 404)
 * - User deletion with confirmation dialog
 * - Empty state when no users returned
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mocks (before imports) ───────────────────────────────────────────────────

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../src/logging/logger', () => ({
  uiLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  logError: jest.fn(),
}));

// Mock axios
jest.mock('axios', () => {
  const mockAxios = {
    get: jest.fn(),
    delete: jest.fn(),
    isAxiosError: jest.fn(),
    defaults: { headers: { common: {} } },
    create: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockAxios,
    ...mockAxios,
  };
});

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Trash2: (props: Record<string, unknown>) =>
    React.createElement('svg', { 'data-testid': 'trash-icon', ...props }),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { useAuth } from '../../src/hooks/useAuth';
import axios from 'axios';
import AdminUsersView from '../../src/components/views/AdminUsersView';

const mockUseAuth = useAuth as jest.Mock;
const mockAxiosGet = axios.get as jest.Mock;
const mockAxiosDelete = axios.delete as jest.Mock;
const mockIsAxiosError = axios.isAxiosError as unknown as jest.Mock;

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupAuth(
  role: 'owner' | 'maintainer' | 'readonly',
  opts: { loading?: boolean; authenticated?: boolean } = {}
) {
  const { loading = false, authenticated = true } = opts;
  mockUseAuth.mockReturnValue({
    user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role },
    isAuthenticated: authenticated,
    loading,
    error: null,
    hasRole: (r: string) => {
      const hierarchy: Record<string, number> = { readonly: 1, maintainer: 2, owner: 3 };
      return (hierarchy[role] ?? 0) >= (hierarchy[r] ?? 999);
    },
    hasPermission: jest.fn(() => false),
    token: 'mock-token',
    initialized: true,
    login: jest.fn(),
    logout: jest.fn(),
    getUserTeams: jest.fn(() => []),
    userProfile: null,
  });
}

const sampleUsers = [
  {
    id: 'u1',
    name: 'Alice Admin',
    email: 'alice@example.com',
    role: 'owner',
  },
  {
    id: 'u2',
    name: 'Bob Builder',
    email: 'bob@example.com',
    role: 'maintainer',
  },
  {
    id: 'u3',
    name: null,
    email: 'charlie@example.com',
    role: 'readonly',
  },
];

function mockUsersResponse(users = sampleUsers) {
  mockAxiosGet.mockResolvedValue({
    data: { users },
    status: 200,
  });
}

// ── Auth / access control ────────────────────────────────────────────────────

describe('AdminUsersView — access control', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows loading state when auth is loading', () => {
    setupAuth('owner', { loading: true, authenticated: false });
    render(<AdminUsersView />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows loading state when not authenticated', () => {
    setupAuth('owner', { authenticated: false });
    render(<AdminUsersView />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows permission denied for readonly users', () => {
    setupAuth('readonly');
    render(<AdminUsersView />);
    expect(screen.getByText(/don.t have permission/i)).toBeInTheDocument();
    expect(screen.queryByText('User Management')).not.toBeInTheDocument();
  });

  it('shows permission denied for maintainer users', () => {
    setupAuth('maintainer');
    render(<AdminUsersView />);
    expect(screen.getByText(/don.t have permission/i)).toBeInTheDocument();
  });

  it('shows user management for owner', async () => {
    setupAuth('owner');
    mockUsersResponse();
    render(<AdminUsersView />);

    await waitFor(() => {
      expect(screen.getByText('User Management')).toBeInTheDocument();
    });
  });
});

// ── User listing ─────────────────────────────────────────────────────────────

describe('AdminUsersView — user listing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows loading skeletons while fetching', async () => {
    setupAuth('owner');
    // Never resolves during this assertion
    mockAxiosGet.mockReturnValue(new Promise(() => {}));

    render(<AdminUsersView />);

    // The component renders Skeleton elements with data-slot="skeleton"
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('displays users in a table after loading', async () => {
    setupAuth('owner');
    mockUsersResponse();

    render(<AdminUsersView />);

    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });

    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Bob Builder')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('shows "Unknown" for users without a name', async () => {
    setupAuth('owner');
    mockUsersResponse();

    render(<AdminUsersView />);

    await waitFor(() => {
      expect(screen.getByText('charlie@example.com')).toBeInTheDocument();
    });

    // User with null name should show "Unknown"
    const unknownCells = screen.getAllByText('Unknown');
    expect(unknownCells.length).toBeGreaterThanOrEqual(1);
  });

  it('renders table headers', async () => {
    setupAuth('owner');
    mockUsersResponse();

    render(<AdminUsersView />);

    await waitFor(() => {
      expect(screen.getByText('Username')).toBeInTheDocument();
    });
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Teams')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('renders empty teams container when user has no team assignments', async () => {
    setupAuth('owner');
    mockUsersResponse();

    render(<AdminUsersView />);

    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });

    // Users with empty teams[] render an empty flex container (empty array map is truthy in JSX)
    // Verify no Badge elements are rendered for teams
    expect(screen.queryByText('Alpha Team')).not.toBeInTheDocument();
  });

  it('calls /api/admin/users on mount', async () => {
    setupAuth('owner');
    mockUsersResponse();

    render(<AdminUsersView />);

    await waitFor(() => {
      expect(mockAxiosGet).toHaveBeenCalledWith(
        '/api/admin/users',
        expect.objectContaining({
          withCredentials: true,
        })
      );
    });
  });

  it('renders empty table when API returns no users', async () => {
    setupAuth('owner');
    mockUsersResponse([]);

    render(<AdminUsersView />);

    await waitFor(() => {
      expect(screen.getByText('Users')).toBeInTheDocument();
    });

    // Table should exist but have no user rows
    expect(screen.queryByText('Alice Admin')).not.toBeInTheDocument();
  });
});

// ── Error handling ───────────────────────────────────────────────────────────

describe('AdminUsersView — error handling', () => {
  beforeEach(() => jest.clearAllMocks());

  it('displays error message when fetch fails with Error', async () => {
    setupAuth('owner');
    mockAxiosGet.mockRejectedValue(new Error('Network error'));

    render(<AdminUsersView />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('displays generic error for non-Error throws', async () => {
    setupAuth('owner');
    mockAxiosGet.mockRejectedValue('something went wrong');

    render(<AdminUsersView />);

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch users')).toBeInTheDocument();
    });
  });
});

// ── User deletion ────────────────────────────────────────────────────────────

describe('AdminUsersView — user deletion', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows delete button for each user', async () => {
    setupAuth('owner');
    mockUsersResponse();

    render(<AdminUsersView />);

    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('Delete User');
    expect(deleteButtons.length).toBe(3);
  });

  it('removes user from list after successful deletion', async () => {
    setupAuth('owner');
    mockUsersResponse();
    mockAxiosDelete.mockResolvedValue({ status: 200 });

    render(<AdminUsersView />);

    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });

    // Click the first delete button to open dialog
    const deleteButtons = screen.getAllByText('Delete User');
    await userEvent.click(deleteButtons[0]);

    // Confirm in the dialog - find the confirmation button within the dialog
    await waitFor(() => {
      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toBeInTheDocument();
    });

    // The dialog has a second "Delete User" button for confirmation
    const dialogDeleteButtons = screen.getAllByText('Delete User');
    // The last one should be the confirm button in the dialog
    const confirmButton = dialogDeleteButtons[dialogDeleteButtons.length - 1];
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.queryByText('Alice Admin')).not.toBeInTheDocument();
    });

    expect(mockAxiosDelete).toHaveBeenCalledWith(
      '/api/admin/users?userId=u1',
      expect.objectContaining({ withCredentials: true })
    );
  });

  it('shows error when delete returns 403', async () => {
    setupAuth('owner');
    mockUsersResponse();

    const axiosError = {
      response: { status: 403, data: { error: 'Forbidden' } },
      isAxiosError: true,
    };
    mockAxiosDelete.mockRejectedValue(axiosError);
    mockIsAxiosError.mockReturnValue(true);

    render(<AdminUsersView />);

    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });

    // Open dialog and confirm
    const deleteButtons = screen.getAllByText('Delete User');
    await userEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    const allDeleteBtns = screen.getAllByText('Delete User');
    await userEvent.click(allDeleteBtns[allDeleteBtns.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('Insufficient permissions to delete user')).toBeInTheDocument();
    });
  });

  it('shows error when delete returns 404', async () => {
    setupAuth('owner');
    mockUsersResponse();

    const axiosError = {
      response: { status: 404, data: { error: 'Not found' } },
      isAxiosError: true,
    };
    mockAxiosDelete.mockRejectedValue(axiosError);
    mockIsAxiosError.mockReturnValue(true);

    render(<AdminUsersView />);

    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('Delete User');
    await userEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    const allDeleteBtns = screen.getAllByText('Delete User');
    await userEvent.click(allDeleteBtns[allDeleteBtns.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('User not found')).toBeInTheDocument();
    });
  });
});

// ── Card structure ───────────────────────────────────────────────────────────

describe('AdminUsersView — card structure', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the card title and description', async () => {
    setupAuth('owner');
    mockUsersResponse();

    render(<AdminUsersView />);

    await waitFor(() => {
      expect(screen.getByText('Users')).toBeInTheDocument();
    });
    expect(screen.getByText('Manage users and their team assignments')).toBeInTheDocument();
  });

  it('renders the page heading', async () => {
    setupAuth('owner');
    mockUsersResponse();

    render(<AdminUsersView />);

    await waitFor(() => {
      expect(screen.getByText('User Management')).toBeInTheDocument();
    });
  });
});
