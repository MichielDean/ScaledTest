import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegisterPage } from '../register';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth-store';

vi.mock('../../lib/api', () => ({
  api: {
    register: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => mockNavigate,
}));

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false });
  });

  it('renders the registration form', () => {
    render(<RegisterPage />);

    expect(screen.getByRole('heading', { name: 'ScaledTest' })).toBeInTheDocument();
    expect(screen.getByLabelText('Display Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
  });

  it('shows sign in link', () => {
    render(<RegisterPage />);
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });

  it('shows OAuth buttons', () => {
    render(<RegisterPage />);
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('shows error for short password', async () => {
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('calls register and navigates on success', async () => {
    vi.mocked(api.register).mockResolvedValue({
      user: { id: 'u1', email: 'test@test.com', display_name: 'Test', role: 'readonly' },
      access_token: 'tok',
    });

    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(api.register).toHaveBeenCalledWith('test@test.com', 'password123', 'Test');
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
    });
  });

  it('sets auth state on successful registration', async () => {
    vi.mocked(api.register).mockResolvedValue({
      user: { id: 'u1', email: 'test@test.com', display_name: 'Test', role: 'readonly' },
      access_token: 'my-token',
    });

    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      const state = useAuthStore.getState();
      expect(state.accessToken).toBe('my-token');
      expect(state.isAuthenticated).toBe(true);
    });
  });

  it('shows error on registration failure', async () => {
    vi.mocked(api.register).mockRejectedValue(new Error('Email already taken'));

    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(await screen.findByText('Email already taken')).toBeInTheDocument();
  });

  it('shows loading state during registration', async () => {
    vi.mocked(api.register).mockImplementation(() => new Promise(() => {}));

    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(screen.getByText('Creating account...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Creating account...' })).toBeDisabled();
    });
  });
});
