import { render, screen } from '@testing-library/react';
import { OAuthCallbackPage } from '../oauth-callback';
import { useAuthStore } from '../../stores/auth-store';

const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

function makeJWT(payload: object): string {
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

describe('OAuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/auth/callback');
    useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false });
  });

  it('shows completing sign in message when valid token is present', () => {
    const token = makeJWT({ sub: 'u1', email: 'test@example.com', role: 'member' });
    window.history.pushState({}, '', `/auth/callback?token=${token}`);
    render(<OAuthCallbackPage />);
    expect(screen.getByText('Completing sign in...')).toBeInTheDocument();
  });

  it('calls setAuth with decoded user info from valid JWT', () => {
    const token = makeJWT({
      sub: 'user-abc',
      email: 'alice@example.com',
      role: 'admin',
      display_name: 'Alice',
    });
    window.history.pushState({}, '', `/auth/callback?token=${token}`);
    render(<OAuthCallbackPage />);
    const { user, accessToken, isAuthenticated } = useAuthStore.getState();
    expect(user?.id).toBe('user-abc');
    expect(user?.email).toBe('alice@example.com');
    expect(user?.role).toBe('admin');
    expect(user?.display_name).toBe('Alice');
    expect(accessToken).toBe(token);
    expect(isAuthenticated).toBe(true);
  });

  it('uses email as display_name when display_name claim is absent', () => {
    const token = makeJWT({ sub: 'u1', email: 'user@example.com' });
    window.history.pushState({}, '', `/auth/callback?token=${token}`);
    render(<OAuthCallbackPage />);
    expect(useAuthStore.getState().user?.display_name).toBe('user@example.com');
  });

  it('uses "member" role when role claim is absent', () => {
    const token = makeJWT({ sub: 'u1', email: 'user@example.com' });
    window.history.pushState({}, '', `/auth/callback?token=${token}`);
    render(<OAuthCallbackPage />);
    expect(useAuthStore.getState().user?.role).toBe('member');
  });

  it('navigates to / after successful authentication', () => {
    const token = makeJWT({ sub: 'u1', email: 'user@example.com' });
    window.history.pushState({}, '', `/auth/callback?token=${token}`);
    render(<OAuthCallbackPage />);
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
  });

  it('shows Authentication Error heading when error param is in URL', () => {
    window.history.pushState({}, '', '/auth/callback?error=access_denied');
    render(<OAuthCallbackPage />);
    expect(screen.getByText('Authentication Error')).toBeInTheDocument();
    expect(screen.getByText('access_denied')).toBeInTheDocument();
  });

  it('shows error message when no token and no error in URL', () => {
    render(<OAuthCallbackPage />);
    expect(screen.getByText('Authentication Error')).toBeInTheDocument();
    expect(screen.getByText('No authentication token received')).toBeInTheDocument();
  });

  it('shows malformed token error when token does not have 3 parts', () => {
    window.history.pushState({}, '', '/auth/callback?token=only.two');
    render(<OAuthCallbackPage />);
    expect(screen.getByText('OAuth login failed: malformed token')).toBeInTheDocument();
  });

  it('shows malformed token error when payload part is empty', () => {
    window.history.pushState({}, '', '/auth/callback?token=header..signature');
    render(<OAuthCallbackPage />);
    expect(screen.getByText('OAuth login failed: malformed token')).toBeInTheDocument();
  });

  it('shows invalid token error when base64 decoding fails', () => {
    // Payload part contains invalid base64 character
    window.history.pushState({}, '', '/auth/callback?token=header.!!!invalid!!!.signature');
    render(<OAuthCallbackPage />);
    expect(screen.getByText('OAuth login failed: invalid token')).toBeInTheDocument();
  });

  it('shows missing user ID error when sub claim is absent', () => {
    const token = makeJWT({ email: 'user@example.com' });
    window.history.pushState({}, '', `/auth/callback?token=${token}`);
    render(<OAuthCallbackPage />);
    expect(screen.getByText('OAuth login failed: missing user ID')).toBeInTheDocument();
  });

  it('shows missing email error when email claim is absent', () => {
    const token = makeJWT({ sub: 'u1' });
    window.history.pushState({}, '', `/auth/callback?token=${token}`);
    render(<OAuthCallbackPage />);
    expect(screen.getByText('OAuth login failed: missing email')).toBeInTheDocument();
  });

  it('shows Back to login link on error', () => {
    window.history.pushState({}, '', '/auth/callback?error=access_denied');
    render(<OAuthCallbackPage />);
    const link = screen.getByRole('link', { name: 'Back to login' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/login');
  });

  it('does not navigate when authentication fails', () => {
    window.history.pushState({}, '', '/auth/callback?error=access_denied');
    render(<OAuthCallbackPage />);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
