import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useSession } from '@/lib/auth-client';
import { authClient } from '@/lib/auth-client';
import logger from '@/logging/logger';
import { type Role, type Permission, rolePermissions } from '@/lib/roles';

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

  // Cached team IDs and names for the current user.
  // Role is intentionally NOT stored here — it is derived from the live session
  // at call time in getUserTeams() so it never goes stale when an owner changes
  // the user's role without triggering a re-login.
  const [userTeams, setUserTeams] = useState<Array<{ id: string; name: string }>>([]);

  // Get user role from Better Auth metadata
  const getUserRole = (): Role | null => {
    if (!user) return null;
    const userWithRole = user as { role?: string };
    const userRole = userWithRole.role;
    if (!userRole) return null;
    const validRoles: Role[] = ['readonly', 'maintainer', 'owner'];
    return validRoles.includes(userRole as Role) ? (userRole as Role) : null;
  };

  // Fetch team memberships from the server whenever the user changes.
  // This replaces the previous placeholder that hard-coded a 'default-team' entry.
  useEffect(() => {
    if (!user?.id) {
      setUserTeams([]);
      return;
    }

    let cancelled = false;

    const fetchTeams = async () => {
      try {
        const response = await fetch('/api/user-teams', { credentials: 'include' });
        if (!response.ok) {
          logger.warn({ status: response.status }, 'Failed to fetch user teams');
          return;
        }
        const data = (await response.json()) as {
          success: boolean;
          teams?: Array<{ id: string; name: string; description?: string; isDefault?: boolean }>;
        };
        if (!cancelled && data.success && Array.isArray(data.teams)) {
          // Store only id and name — role is derived at call time from the live
          // session so it cannot go stale if an owner updates the user's role.
          setUserTeams(data.teams.map(t => ({ id: t.id, name: t.name })));
        }
      } catch (err) {
        if (!cancelled) {
          logger.error({ err }, 'Error fetching user teams');
        }
      }
    };

    fetchTeams();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Return team memberships with the *current* global role attached at call time.
  // Role is not cached in state to avoid stale values when an owner changes the
  // user's role without a re-login.
  const getUserTeams = () => {
    const currentRole = getUserRole() || 'readonly';
    return userTeams.map(t => ({ ...t, role: currentRole }));
  };

  const hasRole = (role: Role): boolean => {
    const userRole = getUserRole();
    if (!userRole) return false;

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
    const userPermissions = rolePermissions[userRole] || [];
    return userPermissions.includes(permission);
  };

  const logout = async (): Promise<void> => {
    try {
      setUserTeams([]);
      await authClient.signOut();
      window.location.href = '/login';
    } catch (err) {
      logger.error({ error: err }, 'Logout failed');
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
    getUserTeams,
  };

  return <BetterAuthContext.Provider value={contextValue}>{children}</BetterAuthContext.Provider>;
};

export default BetterAuthProvider;
