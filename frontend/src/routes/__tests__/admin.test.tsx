import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminPage } from '../admin';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth-store';

vi.mock('../../lib/api', () => ({
  api: {
    adminListUsers: vi.fn(),
    getTeams: vi.fn(),
    adminListAuditLog: vi.fn(),
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: 'u1', email: 'admin@example.com', display_name: 'Admin', role: 'owner' },
      accessToken: 'tok',
      isAuthenticated: true,
    });
    vi.mocked(api.adminListUsers).mockResolvedValue({ users: [], total: 0 });
    vi.mocked(api.getTeams).mockResolvedValue({ teams: [] });
    vi.mocked(api.adminListAuditLog).mockResolvedValue({ audit_log: [], total: 0 });
  });

  it('shows access denied for non-owner', () => {
    useAuthStore.setState({
      user: { id: 'u2', email: 'member@example.com', display_name: 'Member', role: 'member' },
      accessToken: 'tok',
      isAuthenticated: true,
    });
    renderWithClient(<AdminPage />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });

  it('renders Admin heading for owner', () => {
    renderWithClient(<AdminPage />);
    expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
  });

  it('renders Audit Log section heading', () => {
    renderWithClient(<AdminPage />);
    expect(screen.getByRole('heading', { name: 'Audit Log' })).toBeInTheDocument();
  });

  it('shows loading state for audit log', () => {
    vi.mocked(api.adminListAuditLog).mockReturnValue(new Promise(() => {}));
    renderWithClient(<AdminPage />);
    expect(screen.getByText('Loading audit log...')).toBeInTheDocument();
  });

  it('shows empty state when no audit log entries', async () => {
    vi.mocked(api.adminListAuditLog).mockResolvedValue({ audit_log: [], total: 0 });
    renderWithClient(<AdminPage />);
    expect(await screen.findByText('No audit log entries found')).toBeInTheDocument();
  });

  it('renders audit log table columns', async () => {
    vi.mocked(api.adminListAuditLog).mockResolvedValue({ audit_log: [], total: 0 });
    renderWithClient(<AdminPage />);
    expect(await screen.findByText('Actor')).toBeInTheDocument();
    expect(await screen.findByText('Action')).toBeInTheDocument();
    expect(await screen.findByText('Resource Type')).toBeInTheDocument();
    expect(await screen.findByText('Resource ID')).toBeInTheDocument();
    expect(await screen.findByText('Team')).toBeInTheDocument();
    expect(await screen.findByText('Timestamp')).toBeInTheDocument();
  });

  it('renders audit log entries with actor, action, resource type', async () => {
    vi.mocked(api.adminListAuditLog).mockResolvedValue({
      audit_log: [
        {
          id: 'al1',
          actor_id: 'u1',
          actor_email: 'admin@example.com',
          team_id: 'team-abc',
          action: 'create_team',
          resource_type: 'team',
          resource_id: 'res-xyz',
          created_at: '2026-01-15T10:00:00Z',
        },
      ],
      total: 1,
    });
    renderWithClient(<AdminPage />);
    expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
    expect(await screen.findByText('create_team')).toBeInTheDocument();
    expect(await screen.findByText('team')).toBeInTheDocument();
    expect(await screen.findByText('res-xyz')).toBeInTheDocument();
    expect(await screen.findByText('team-abc')).toBeInTheDocument();
  });

  it('disables Previous button on first page', async () => {
    vi.mocked(api.adminListAuditLog).mockResolvedValue({ audit_log: [], total: 0 });
    renderWithClient(<AdminPage />);
    expect(await screen.findByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('disables Next button when all entries are shown', async () => {
    vi.mocked(api.adminListAuditLog).mockResolvedValue({ audit_log: [], total: 0 });
    renderWithClient(<AdminPage />);
    expect(await screen.findByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('enables Next when more entries exist beyond current page', async () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      id: `al${i}`,
      actor_id: 'u1',
      actor_email: 'admin@example.com',
      team_id: null,
      action: 'test_action',
      resource_type: null,
      resource_id: null,
      created_at: '2026-01-15T10:00:00Z',
    }));
    vi.mocked(api.adminListAuditLog).mockResolvedValue({ audit_log: entries, total: 30 });
    renderWithClient(<AdminPage />);
    expect(await screen.findByRole('button', { name: 'Next' })).not.toBeDisabled();
  });

  it('shows error message when audit log query fails', async () => {
    vi.mocked(api.adminListAuditLog).mockRejectedValue(new Error('Network error'));
    renderWithClient(<AdminPage />);
    expect(await screen.findByText('Failed to load audit log.')).toBeInTheDocument();
    expect(screen.queryByText('No audit log entries found')).not.toBeInTheDocument();
  });

  it('advances to next page when Next is clicked', async () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      id: `al${i}`,
      actor_id: 'u1',
      actor_email: `user${i}@example.com`,
      team_id: null,
      action: 'action',
      resource_type: null,
      resource_id: null,
      created_at: '2026-01-15T10:00:00Z',
    }));
    vi.mocked(api.adminListAuditLog).mockResolvedValue({ audit_log: entries, total: 30 });
    renderWithClient(<AdminPage />);

    const next = await screen.findByRole('button', { name: 'Next' });
    fireEvent.click(next);

    expect(vi.mocked(api.adminListAuditLog)).toHaveBeenCalledWith(20, 20, '');
  });

  it('returns to first page when Previous is clicked after Next', async () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      id: `al${i}`,
      actor_id: 'u1',
      actor_email: `user${i}@example.com`,
      team_id: null,
      action: 'action',
      resource_type: null,
      resource_id: null,
      created_at: '2026-01-15T10:00:00Z',
    }));
    vi.mocked(api.adminListAuditLog).mockResolvedValue({ audit_log: entries, total: 30 });
    renderWithClient(<AdminPage />);

    const next = await screen.findByRole('button', { name: 'Next' });
    fireEvent.click(next);

    const prev = await screen.findByRole('button', { name: 'Previous' });
    await waitFor(() => expect(prev).not.toBeDisabled());
    fireEvent.click(prev);

    expect(vi.mocked(api.adminListAuditLog)).toHaveBeenLastCalledWith(20, 0, '');
  });

  it('renders action type filter select', async () => {
    renderWithClient(<AdminPage />);
    expect(await screen.findByRole('combobox', { name: /action/i })).toBeInTheDocument();
  });

  it('calls API with empty action on initial render', async () => {
    renderWithClient(<AdminPage />);
    await screen.findByRole('combobox', { name: /action/i });
    expect(vi.mocked(api.adminListAuditLog)).toHaveBeenCalledWith(20, 0, '');
  });

  it('calls API with selected action type when filter changes', async () => {
    renderWithClient(<AdminPage />);
    const select = await screen.findByRole('combobox', { name: /action/i });
    fireEvent.change(select, { target: { value: 'report.submitted' } });
    await waitFor(() => {
      expect(vi.mocked(api.adminListAuditLog)).toHaveBeenCalledWith(20, 0, 'report.submitted');
    });
  });

  it('resets to page 1 when action filter changes', async () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      id: `al${i}`,
      actor_id: 'u1',
      actor_email: `user${i}@example.com`,
      team_id: null,
      action: 'action',
      resource_type: null,
      resource_id: null,
      created_at: '2026-01-15T10:00:00Z',
    }));
    vi.mocked(api.adminListAuditLog).mockResolvedValue({ audit_log: entries, total: 30 });
    renderWithClient(<AdminPage />);

    const next = await screen.findByRole('button', { name: 'Next' });
    fireEvent.click(next);
    await waitFor(() => {
      expect(vi.mocked(api.adminListAuditLog)).toHaveBeenCalledWith(20, 20, '');
    });

    const select = screen.getByRole('combobox', { name: /action/i });
    fireEvent.change(select, { target: { value: 'report.submitted' } });
    await waitFor(() => {
      expect(vi.mocked(api.adminListAuditLog)).toHaveBeenCalledWith(20, 0, 'report.submitted');
    });
  });
});
