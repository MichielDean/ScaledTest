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
import { useAuth } from '../auth/KeycloakProvider';
import { Team } from '../types/team';
import { UserRole } from '../auth/keycloak';
import { uiLogger as logger } from '../logging/logger';
import { DEMO_DATA_TEAM } from '../lib/teamFilters';
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
  const { isAuthenticated, token, keycloak, hasRole } = useAuth();
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get user ID from keycloak instance
  const userId = keycloak?.subject;

  // Fetch user's teams
  const refreshUserTeams = useCallback(async () => {
    if (!isAuthenticated || !token || !userId) {
      setUserTeams([]);
      return;
    }

    try {
      setError(null);
      const response = await axios.get(`/api/user-teams`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data?.success) {
        const teams = Array.isArray(response.data.teams) ? response.data.teams : [];
        setUserTeams(teams);

        // Auto-select teams if none selected and user has teams
        if (selectedTeamIds.length === 0 && teams.length > 0) {
          setSelectedTeamIds(teams.map((team: Team) => team.id));
        }
      }
    } catch (err) {
      logger.error('Failed to fetch user teams', { error: err, userId });
      setError('Failed to load team information');
      setUserTeams([]);
    }
  }, [isAuthenticated, token, userId, selectedTeamIds.length]);

  // Fetch all teams (for admin/maintainer users)
  const refreshAllTeams = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setAllTeams([]);
      return;
    }

    try {
      const response = await axios.get('/api/admin/teams', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data?.success) {
        setAllTeams(Array.isArray(response.data.data) ? response.data.data : []);
      }
    } catch (err) {
      // Non-admin users can't access this endpoint, which is expected
      logger.debug('Could not fetch all teams', { error: err });
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
  const canManageTeams = hasRole(UserRole.MAINTAINER) || hasRole(UserRole.OWNER);

  // Effective team IDs for API filtering - includes demo data access
  const effectiveTeamIds = selectedTeamIds.length > 0 ? selectedTeamIds : [DEMO_DATA_TEAM];

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
