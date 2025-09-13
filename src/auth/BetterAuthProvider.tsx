import React, { createContext, useContext, ReactNode } from 'react';
import { useSession } from '@/lib/auth-client';
import { authClient } from '@/lib/auth-client';
import logger from '@/logging/logger';
import { type Role, type Permission, rolePermissions } from '@/lib/permissions';

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

  // Role and permission checking
  hasRole: (role: Role) => boolean;
  hasPermission: (permission: Permission) => boolean;

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
  hasPermission: () => false,
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
    const validRoles: Role[] = ['readonly', 'maintainer', 'owner'];
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
          role: getUserRole() || 'readonly',
        },
      ]
    );
  };
  const hasRole = (role: Role): boolean => {
    const userRole = getUserRole();
    if (!userRole) return false;

    // Support hierarchical roles - higher roles inherit lower role permissions
    if (role === 'readonly') {
      return userRole === 'readonly' || userRole === 'maintainer' || userRole === 'owner';
    }
    if (role === 'maintainer') {
      return userRole === 'maintainer' || userRole === 'owner';
    }
    if (role === 'owner') {
      return userRole === 'owner';
    }

    return false;
  };

  const hasPermission = (permission: Permission): boolean => {
    const userRole = getUserRole();
    if (!userRole) return false;

    // Use the rolePermissions mapping from permissions.ts
    const userPermissions = rolePermissions[userRole] || [];
    return userPermissions.includes(permission);
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
    hasPermission,
    token: sessionData?.token || undefined,
    initialized: !loading,

    // Team management functions
    getUserTeams,
  };

  return <BetterAuthContext.Provider value={contextValue}>{children}</BetterAuthContext.Provider>;
};

export default BetterAuthProvider;
