import { useBetterAuth, type BetterAuthContextType } from '@/auth/BetterAuthProvider';

// Re-export Better Auth hook for consistency with existing imports
export const useAuth = (): BetterAuthContextType => {
  return useBetterAuth();
};

// Also export the provider for convenience
export { BetterAuthProvider } from '@/auth/BetterAuthProvider';
