import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfilePage } from '../profile';

const mockUpdateProfile = vi.fn();
const mockChangePassword = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    updateProfile: mockUpdateProfile,
    changePassword: mockChangePassword,
  },
}));

const mockSetUser = vi.fn();

vi.mock('../../stores/auth-store', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', email: 'test@test.com', display_name: 'Test User', role: 'maintainer' },
    setUser: mockSetUser,
  }),
}));

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders profile settings heading', () => {
    render(<ProfilePage />);
    expect(screen.getByRole('heading', { name: 'Profile Settings' })).toBeInTheDocument();
  });

  it('renders display name form with current value', () => {
    render(<ProfilePage />);
    const input = screen.getByLabelText('Display Name');
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe('Test User');
  });

  it('renders change password form', () => {
    render(<ProfilePage />);
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
    render(<ProfilePage />);

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
    render(<ProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Save Name' }));

    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });

  it('shows loading state during display name save', async () => {
    mockUpdateProfile.mockImplementation(() => new Promise(() => {}));
    render(<ProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Save Name' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    });
  });

  it('calls changePassword on password form submit', async () => {
    mockChangePassword.mockResolvedValue({ message: 'password changed' });
    render(<ProfilePage />);

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
    render(<ProfilePage />);

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
    render(<ProfilePage />);

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
    render(<ProfilePage />);

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
    render(<ProfilePage />);

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
    render(<ProfilePage />);

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
});
