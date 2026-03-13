import { renderHook, act } from '@testing-library/react';
import { useAuth } from '../use-auth';
import { useAuthStore } from '../../stores/auth-store';
import { api } from '../../lib/api';

// Mock api module
vi.mock('../../lib/api', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}));

// Mock TanStack Router's useNavigate
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: null,
    accessToken: null,
    isAuthenticated: false,
  });
});

describe('useAuth', () => {
  it('returns unauthenticated state initially', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  describe('login', () => {
    it('calls api.login, sets auth state, and navigates to /', async () => {
      const loginResponse = {
        user: { id: 'u1', email: 'a@b.com', display_name: 'A', role: 'member' },
        access_token: 'tok',
      };
      vi.mocked(api.login).mockResolvedValue(loginResponse);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login('a@b.com', 'pass');
      });

      expect(api.login).toHaveBeenCalledWith('a@b.com', 'pass');
      expect(result.current.user).toEqual(loginResponse.user);
      expect(result.current.isAuthenticated).toBe(true);
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
    });
  });

  describe('register', () => {
    it('calls api.register, sets auth state, and navigates to /', async () => {
      const registerResponse = {
        user: { id: 'u2', email: 'b@c.com', display_name: 'B', role: 'member' },
        access_token: 'tok2',
      };
      vi.mocked(api.register).mockResolvedValue(registerResponse);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.register('b@c.com', 'pass', 'B');
      });

      expect(api.register).toHaveBeenCalledWith('b@c.com', 'pass', 'B');
      expect(result.current.user).toEqual(registerResponse.user);
      expect(result.current.isAuthenticated).toBe(true);
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
    });
  });

  describe('logout', () => {
    it('calls api.logout, clears auth, and navigates to /login', async () => {
      // Start authenticated
      useAuthStore.getState().setAuth(
        { id: 'u1', email: 'a@b.com', display_name: 'A', role: 'member' },
        'tok'
      );
      vi.mocked(api.logout).mockResolvedValue(undefined as never);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.logout();
      });

      expect(api.logout).toHaveBeenCalled();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/login' });
    });

    it('clears auth and navigates even if api.logout throws', async () => {
      useAuthStore.getState().setAuth(
        { id: 'u1', email: 'a@b.com', display_name: 'A', role: 'member' },
        'tok'
      );
      vi.mocked(api.logout).mockRejectedValue(new Error('network error'));

      const { result } = renderHook(() => useAuth());

      // logout uses try/finally (no catch), so the rejection propagates
      await act(async () => {
        await result.current.logout().catch(() => {});
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/login' });
    });
  });
});
