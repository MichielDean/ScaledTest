import { useAuthStore } from '../stores/auth-store';
import { api } from '../lib/api';
import { useNavigate } from '@tanstack/react-router';

export function useAuth() {
  const { user, isAuthenticated, setAuth, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const login = async (email: string, password: string) => {
    const response = await api.login(email, password);
    setAuth(response.user, response.access_token);
    navigate({ to: '/' });
  };

  const register = async (email: string, password: string, displayName: string) => {
    const response = await api.register(email, password, displayName);
    setAuth(response.user, response.access_token);
    navigate({ to: '/' });
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      clearAuth();
      navigate({ to: '/login' });
    }
  };

  return { user, isAuthenticated, login, register, logout };
}
