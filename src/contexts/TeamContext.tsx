/**
 * Team Context Provider
 *
 * Provides team-related state management across the application.
 * Handles user's team data, selected teams for filtering, and team-based operations.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from 'react';
import { useBetterAuth } from '../auth/BetterAuthProvider';
import { Team } from '../types/team';
import { uiLogger } from '../logging/logger';
import axios from 'axios';

interface TeamContextType {
  // Team data
  userTeams: Team[];
  selectedTeamIds: string[];
  allTeams: Team[];
  loading: boolean;
  error: string | null;

  // Team selection
  setSelectedTeamIds: (teamIds: string[]) => void;
  selectAllTeams: () => void;
  clearTeamSelection: () => void;

  // Team operations
  refreshUserTeams: () => Promise<void>;
  refreshAllTeams: () => Promise<void>;

  // Computed values
  selectedTeams: Team[];
  hasMultipleTeams: boolean;
  canManageTeams: boolean;
  effectiveTeamIds: string[]; // IDs to use for API filtering
}

const TeamContext = createContext<TeamContextType>({
  userTeams: [],
  selectedTeamIds: [],
  allTeams: [],
  loading: true,
  error: null,
  setSelectedTeamIds: () => {},
  selectAllTeams: () => {},
  clearTeamSelection: () => {},
  refreshUserTeams: async () => {},
  refreshAllTeams: async () => {},
  selectedTeams: [],
  hasMultipleTeams: false,
  canManageTeams: false,
  effectiveTeamIds: [],
});

export const useTeams = () => useContext(TeamContext);

interface TeamProviderProps {
  children: ReactNode;
}

export const TeamProvider: React.FC<TeamProviderProps> = ({ children }) => {
  const { isAuthenticated, user, hasRole, token } = useBetterAuth();
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get user ID from Better Auth user object
  const userWithId = user as { id?: string };
  const userId = userWithId?.id;

  // Fetch user's teams from Better Auth user metadata
  const refreshUserTeams = useCallback(async () => {
    if (!isAuthenticated || !userId) {
      setUserTeams([]);
      return;
    }

    try {
      setError(null);

      // Get teams from Better Auth user metadata
      const userWithTeams = user as {
        teams?: Array<{ id: string; name: string; role: string }>;
      };
      const userTeamsFromAuth = userWithTeams?.teams || [];

      // Convert Better Auth team format to our Team interface
      const teams: Team[] = userTeamsFromAuth.map(team => ({
        id: team.id,
        name: team.name,
        description: `Team managed through Better Auth`,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      setUserTeams(teams);

      // Auto-select teams if none selected and user has teams
      if (selectedTeamIds.length === 0 && teams.length > 0) {
        setSelectedTeamIds(teams.map(team => team.id));
      }
    } catch (err) {
      uiLogger.error('Failed to fetch user teams', { error: err, userId });
      setError('Failed to load team information');
      setUserTeams([]);
    }
  }, [isAuthenticated, user, userId, selectedTeamIds.length]);

  // Fetch all teams (for admin/maintainer users) via API
  const refreshAllTeams = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setAllTeams([]);
      return;
    }

    try {
      const response = await axios.get('/api/teams', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data?.success) {
        setAllTeams(Array.isArray(response.data.data) ? response.data.data : []);
      }
    } catch (err) {
      // Non-admin users can't access this endpoint, which is expected
      uiLogger.debug('Could not fetch all teams', { error: err });
      setAllTeams([]);
    }
  }, [isAuthenticated, token]);

  // Load teams on authentication
  useEffect(() => {
    const loadTeams = async () => {
      if (!isAuthenticated) {
        setUserTeams([]);
        setAllTeams([]);
        setSelectedTeamIds([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      await Promise.all([refreshUserTeams(), refreshAllTeams()]);
      setLoading(false);
    };

    loadTeams();
  }, [isAuthenticated, refreshUserTeams, refreshAllTeams]);

  // Team selection helpers
  const selectAllTeams = useCallback(() => {
    setSelectedTeamIds(userTeams.map(team => team.id));
  }, [userTeams]);

  const clearTeamSelection = useCallback(() => {
    setSelectedTeamIds([]);
  }, []);

  // Computed values
  const selectedTeams = userTeams.filter(team => selectedTeamIds.includes(team.id));
  const hasMultipleTeams = userTeams.length > 1;
  const canManageTeams = hasRole('maintainer') || hasRole('owner');

  // Effective team IDs for API filtering
  const effectiveTeamIds = selectedTeamIds.length > 0 ? selectedTeamIds : [];

  const contextValue: TeamContextType = {
    userTeams,
    selectedTeamIds,
    allTeams,
    loading,
    error,
    setSelectedTeamIds,
    selectAllTeams,
    clearTeamSelection,
    refreshUserTeams,
    refreshAllTeams,
    selectedTeams,
    hasMultipleTeams,
    canManageTeams,
    effectiveTeamIds,
  };

  return <TeamContext.Provider value={contextValue}>{children}</TeamContext.Provider>;
};
