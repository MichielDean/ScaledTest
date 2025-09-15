import React, { createContext, useContext, ReactNode } from 'react';
import { useSession } from '@/lib/auth-client';
import { authClient } from '@/lib/auth-client';
import logger from '@/logging/logger';
import { type Role } from '@/lib/permissions';

// Better Auth user interface
export interface BetterAuthUser {
  id: string;
  name: string;
  email: string;
  role?: string;
  [key: string]: unknown;
}

export interface BetterAuthContextType {
  // Core authentication state
  user: BetterAuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;

  // User profile
  userProfile: BetterAuthUser | null;

  // Authentication methods
  login: typeof authClient.signIn;
  logout: () => Promise<void>;

  // Role checking
  hasRole: (role: Role) => boolean;

  // Team management
  getUserTeams: () => Array<{ id: string; name: string; role: string }>;

  // Session token and initialization state
  token: string | undefined;
  initialized: boolean;
}
const BetterAuthContext = createContext<BetterAuthContextType>({
  user: null,
  isAuthenticated: false,
  loading: true,
  error: null,
  userProfile: null,
  login: authClient.signIn,
  logout: async () => {},
  hasRole: () => false,
  getUserTeams: () => [],
  token: undefined,
  initialized: false,
});

export const useBetterAuth = () => useContext(BetterAuthContext);

interface BetterAuthProviderProps {
  children: ReactNode;
}

export const BetterAuthProvider: React.FC<BetterAuthProviderProps> = ({ children }) => {
  const { data: session, isPending, error } = useSession();
  const user = session?.user;
  const sessionData = session?.session;

  const isAuthenticated = !!session;
  const loading = isPending;

  // Get user role from Better Auth metadata
  const getUserRole = (): Role | null => {
    // Better Auth stores role information in user metadata
    if (!user) return null;

    // Access role from user object - Better Auth with admin plugin stores this
    const userWithRole = user as { role?: string };
    const userRole = userWithRole.role;
    if (!userRole) return null;

    // Validate that the role is one of our defined roles
    const validRoles: Role[] = ['admin', 'user'];
    return validRoles.includes(userRole as Role) ? (userRole as Role) : null;
  };

  // Get user teams from Better Auth metadata (placeholder data for now)
  const getUserTeams = () => {
    if (!user) return [];

    // For Phase 6 implementation, provide default team data
    // In a full implementation, this would come from user metadata
    const userWithTeams = user as {
      teams?: Array<{ id: string; name: string; role: string }>;
    };

    return (
      userWithTeams.teams || [
        {
          id: 'default-team',
          name: 'Default Team',
          role: getUserRole() || 'user',
        },
      ]
    );
  };
  const hasRole = (role: Role): boolean => {
    const userRole = getUserRole();
    if (!userRole) return false;

    // Simple role matching - Better Auth handles permissions internally
    return userRole === role;
  };

  const logout = async (): Promise<void> => {
    try {
      await authClient.signOut();
      // Redirect to login page after logout
      window.location.href = '/login';
    } catch (error) {
      logger.error({ error }, 'Logout failed');
    }
  };

  const contextValue: BetterAuthContextType = {
    user: user as BetterAuthUser | null,
    isAuthenticated,
    loading,
    error: error?.message || null,
    userProfile: user as BetterAuthUser | null,
    login: authClient.signIn,
    logout,
    hasRole,
    token: sessionData?.token || undefined,
    initialized: !loading,

    // Team management functions
    getUserTeams,
  };

  return <BetterAuthContext.Provider value={contextValue}>{children}</BetterAuthContext.Provider>;
};

export default BetterAuthProvider;
