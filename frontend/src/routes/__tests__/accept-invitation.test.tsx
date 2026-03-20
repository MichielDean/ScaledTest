import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AcceptInvitationPage } from '../accept-invitation';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    previewInvitation: vi.fn(),
    acceptInvitation: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ token: 'test-token-123' }),
}));

const mockPreview = {
  email: 'invited@example.com',
  role: 'readonly',
  team_name: 'Acme Corp',
  expires_at: new Date(Date.now() + 86400000).toISOString(),
};

describe('AcceptInvitationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state while fetching invitation', () => {
    vi.mocked(api.previewInvitation).mockImplementation(() => new Promise(() => {}));

    render(<AcceptInvitationPage />);

    expect(screen.getByText('Loading invitation...')).toBeInTheDocument();
  });

  it('renders invitation details and form after loading', async () => {
    vi.mocked(api.previewInvitation).mockResolvedValue(mockPreview);

    render(<AcceptInvitationPage />);

    expect(await screen.findByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('invited@example.com')).toBeInTheDocument();
    expect(screen.getByText('readonly')).toBeInTheDocument();
    expect(screen.getByLabelText('Display Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept Invitation' })).toBeInTheDocument();
  });

  it('shows error when invitation cannot be loaded', async () => {
    vi.mocked(api.previewInvitation).mockRejectedValue(new Error('Invitation not found'));

    render(<AcceptInvitationPage />);

    expect(await screen.findByText('Invitation not found')).toBeInTheDocument();
  });

  it('shows error when previewInvitation resolves with null', async () => {
    vi.mocked(api.previewInvitation).mockResolvedValue(null);

    render(<AcceptInvitationPage />);

    expect(await screen.findByText('Invitation not found')).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    vi.mocked(api.previewInvitation).mockResolvedValue(mockPreview);

    render(<AcceptInvitationPage />);

    await screen.findByLabelText('Password');

    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'different' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept Invitation' }));

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(api.acceptInvitation).not.toHaveBeenCalled();
  });

  it('shows error for short password', async () => {
    vi.mocked(api.previewInvitation).mockResolvedValue(mockPreview);

    render(<AcceptInvitationPage />);

    await screen.findByLabelText('Password');

    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept Invitation' }));

    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(api.acceptInvitation).not.toHaveBeenCalled();
  });

  it('calls acceptInvitation with token, password, and display name on submit', async () => {
    vi.mocked(api.previewInvitation).mockResolvedValue(mockPreview);
    vi.mocked(api.acceptInvitation).mockResolvedValue({ message: 'invitation accepted' });

    render(<AcceptInvitationPage />);

    await screen.findByLabelText('Password');

    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept Invitation' }));

    await waitFor(() => {
      expect(api.acceptInvitation).toHaveBeenCalledWith(
        'test-token-123',
        'password123',
        'Jane Doe'
      );
    });
  });

  it('navigates to login on successful acceptance', async () => {
    vi.mocked(api.previewInvitation).mockResolvedValue(mockPreview);
    vi.mocked(api.acceptInvitation).mockResolvedValue({ message: 'invitation accepted' });

    render(<AcceptInvitationPage />);

    await screen.findByLabelText('Password');

    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept Invitation' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/login' });
    });
  });

  it('shows error on submission failure', async () => {
    vi.mocked(api.previewInvitation).mockResolvedValue(mockPreview);
    vi.mocked(api.acceptInvitation).mockRejectedValue(new Error('Invitation already accepted'));

    render(<AcceptInvitationPage />);

    await screen.findByLabelText('Password');

    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept Invitation' }));

    expect(await screen.findByText('Invitation already accepted')).toBeInTheDocument();
  });

  it('shows loading state during submission', async () => {
    vi.mocked(api.previewInvitation).mockResolvedValue(mockPreview);
    vi.mocked(api.acceptInvitation).mockImplementation(() => new Promise(() => {}));

    render(<AcceptInvitationPage />);

    await screen.findByLabelText('Password');

    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept Invitation' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Accepting...' })).toBeDisabled();
    });
  });

  it('passes an AbortSignal to previewInvitation', () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(api.previewInvitation).mockImplementation((_token, signal) => {
      capturedSignal = signal;
      return new Promise(() => {});
    });

    render(<AcceptInvitationPage />);

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it('aborts the fetch request when component unmounts', () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(api.previewInvitation).mockImplementation((_token, signal) => {
      capturedSignal = signal;
      return new Promise(() => {});
    });

    const { unmount } = render(<AcceptInvitationPage />);
    expect(capturedSignal?.aborted).toBe(false);
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('shows expiry date in invitation details', async () => {
    vi.mocked(api.previewInvitation).mockResolvedValue(mockPreview);

    render(<AcceptInvitationPage />);

    await screen.findByText('Acme Corp');
    expect(screen.getByText(/Expires:/)).toBeInTheDocument();
  });
});
