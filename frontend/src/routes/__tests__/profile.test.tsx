import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfilePage } from '../profile';
import { ToastProvider, toast } from '../../components/toast';

const { mockUpdateProfile, mockChangePassword, mockSetUser } = vi.hoisted(() => ({
  mockUpdateProfile: vi.fn(),
  mockChangePassword: vi.fn(),
  mockSetUser: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: {
    updateProfile: mockUpdateProfile,
    changePassword: mockChangePassword,
  },
}));

vi.mock('../../stores/auth-store', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', email: 'test@test.com', display_name: 'Test User', role: 'maintainer' },
    setUser: mockSetUser,
  }),
}));

vi.mock('../../lib/query-keys', () => ({
  queryKeys: {
    admin: {
      users: () => ['admin', 'users'],
    },
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: {
        onError: (error: Error) => {
          toast(error.message, 'error');
        },
      },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders profile settings heading', () => {
    renderWithClient(<ProfilePage />);
    expect(screen.getByRole('heading', { name: 'Profile Settings' })).toBeInTheDocument();
  });

  it('renders display name form with current value', () => {
    renderWithClient(<ProfilePage />);
    const input = screen.getByLabelText('Display Name');
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe('Test User');
  });

  it('renders change password form', () => {
    renderWithClient(<ProfilePage />);
    expect(screen.getByLabelText('Current Password')).toBeInTheDocument();
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm New Password')).toBeInTheDocument();
  });

  it('calls updateProfile and updates store on display name save', async () => {
    mockUpdateProfile.mockResolvedValue({
      id: 'user-1',
      email: 'test@test.com',
      display_name: 'New Name',
      role: 'maintainer',
    });
    renderWithClient(<ProfilePage />);

    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'New Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Name' }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith('New Name');
    });
    await waitFor(() => {
      expect(mockSetUser).toHaveBeenCalledWith({
        id: 'user-1',
        email: 'test@test.com',
        display_name: 'New Name',
        role: 'maintainer',
      });
    });
    expect(await screen.findByText('Display name updated.')).toBeInTheDocument();
  });

  it('shows error when updateProfile fails', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('Server error'));
    renderWithClient(<ProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Save Name' }));

    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });

  it('shows loading state during display name save', async () => {
    mockUpdateProfile.mockImplementation(() => new Promise(() => {}));
    renderWithClient(<ProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Save Name' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    });
  });

  it('calls changePassword on password form submit', async () => {
    mockChangePassword.mockResolvedValue({ message: 'password changed' });
    renderWithClient(<ProfilePage />);

    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { value: 'oldpass123' },
    });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'newpass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith('oldpass123', 'newpass123');
    });
    expect(await screen.findByText('Password changed successfully.')).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    renderWithClient(<ProfilePage />);

    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { value: 'oldpass123' },
    });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'different' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(await screen.findByText('New passwords do not match')).toBeInTheDocument();
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('shows error when new password is too short', async () => {
    renderWithClient(<ProfilePage />);

    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { value: 'oldpass123' },
    });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(
      await screen.findByText('New password must be at least 8 characters')
    ).toBeInTheDocument();
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('shows error when changePassword fails', async () => {
    mockChangePassword.mockRejectedValue(new Error('Invalid current password'));
    renderWithClient(<ProfilePage />);

    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { value: 'wrongpass' },
    });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'newpass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(await screen.findByText('Invalid current password')).toBeInTheDocument();
  });

  it('shows loading state during password change', async () => {
    mockChangePassword.mockImplementation(() => new Promise(() => {}));
    renderWithClient(<ProfilePage />);

    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { value: 'oldpass123' },
    });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'newpass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Changing...' })).toBeDisabled();
    });
  });

  it('clears password fields after successful change', async () => {
    mockChangePassword.mockResolvedValue({ message: 'password changed' });
    renderWithClient(<ProfilePage />);

    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { value: 'oldpass123' },
    });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'newpass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() => {
      expect((screen.getByLabelText('Current Password') as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText('New Password') as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText('Confirm New Password') as HTMLInputElement).value).toBe('');
    });
  });

  it('shows toast error when profile mutation fails', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('Network error'));
    renderWithClient(<ProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Save Name' }));

    await waitFor(() => {
      expect(screen.getAllByText(/Network error/).length).toBeGreaterThan(0);
    });
  });

  it('shows toast error when password mutation fails', async () => {
    mockChangePassword.mockRejectedValue(new Error('Weak password'));
    renderWithClient(<ProfilePage />);

    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { value: 'oldpass123' },
    });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'newpass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() => {
      expect(screen.getAllByText(/Weak password/).length).toBeGreaterThan(0);
    });
  });
});