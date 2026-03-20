import { create } from 'zustand';

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  setUser: (user: User) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>(set => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  setAuth: (user, accessToken) => set({ user, accessToken, isAuthenticated: true }),
  setUser: (user) => set({ user }),
  clearAuth: () => set({ user: null, accessToken: null, isAuthenticated: false }),
}));
