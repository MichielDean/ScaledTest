import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../types/roles';
import axios from 'axios';
import { uiLogger as logger, logError } from '../../logging/logger';
import { TeamWithMemberCount, TeamPermissions } from '../../types/team';
import CreateTeamModal from '../shared/CreateTeamModal';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

interface TeamsResponse {
  success: boolean;
  data: TeamWithMemberCount[];
  permissions: TeamPermissions;
}

const AdminTeamsView: React.FC = () => {
  const { isAuthenticated, hasRole, loading: authLoading, token } = useAuth();

  // Teams state
  const [teams, setTeams] = useState<TeamWithMemberCount[]>([]);
  const [permissions, setPermissions] = useState<TeamPermissions>({
    canCreateTeam: false,
    canDeleteTeam: false,
    canAssignUsers: false,
    canViewAllTeams: false,
    assignableTeams: [],
  });
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Fetch teams with member counts
  const fetchTeams = useCallback(async () => {
    try {
      setTeamsLoading(true);
      setError(null);

      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await axios.get('/api/teams', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status !== 200) {
        throw new Error(`Failed to fetch teams: ${response.statusText}`);
      }

      const data: TeamsResponse = response.data;
      setTeams(data.data);

      // Ensure permissions is set with fallback to default values
      setPermissions(
        data.permissions || {
          canCreateTeam: false,
          canDeleteTeam: false,
          canAssignUsers: false,
          canViewAllTeams: false,
          assignableTeams: [],
        }
      );
    } catch (error) {
      logError(logger, 'Error fetching teams', error, {
        component: 'AdminTeamsView',
      });
      setError('Failed to fetch teams. Please try again later.');
    } finally {
      setTeamsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchTeams();
    }
  }, [token, fetchTeams]);

  // Modal handlers
  const handleCreateTeam = useCallback(() => {
    setIsCreateModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsCreateModalOpen(false);
  }, []);

  const handleTeamCreated = useCallback(() => {
    // Refresh the teams list after creation
    fetchTeams();
  }, [fetchTeams]);

  if (!isAuthenticated || authLoading) {
    return <div>Loading...</div>;
  }

  if (!hasRole(UserRole.MAINTAINER) && !hasRole(UserRole.OWNER)) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>
            You don&apos;t have permission to access team management.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 id="admin-teams-title" className="text-2xl font-bold">
          Team Management
        </h1>
      </div>

      {/* Error Messages */}
      {error && (
        <Alert>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Teams Section */}
      <Card id="teams-management-section">
        <CardHeader>
          <CardTitle>Teams</CardTitle>
          <CardDescription>Manage teams and their members</CardDescription>
        </CardHeader>
        <CardContent>
          {teamsLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {permissions?.canCreateTeam && (
                <Button id="create-team-button" onClick={handleCreateTeam}>
                  Create Team
                </Button>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teams.map(team => (
                    <TableRow key={team.id}>
                      <TableCell className="font-medium">{team.name}</TableCell>
                      <TableCell>{team.description || 'No description'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{team.memberCount} members</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm">
                            View Members
                          </Button>
                          {permissions?.canDeleteTeam && (
                            <Button variant="destructive" size="sm">
                              Delete
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Team Modal */}
      <CreateTeamModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseModal}
        onTeamCreated={handleTeamCreated}
      />
    </div>
  );
};

export default AdminTeamsView;
