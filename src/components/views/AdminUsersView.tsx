import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/KeycloakProvider';
import { UserRole } from '../../auth/keycloak';
import axios from 'axios';
import { uiLogger as logger, logError } from '../../logging/logger';
import { UserWithTeams } from '../../types/team';

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

const AdminUsersView: React.FC = () => {
  const { isAuthenticated, hasRole, loading: authLoading, token } = useAuth();

  // Users state
  const [users, setUsers] = useState<UserWithTeams[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch users with teams
  const fetchUsers = useCallback(async () => {
    try {
      setUsersLoading(true);
      setError(null);

      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await axios.get('/api/admin/team-assignments', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status !== 200) {
        throw new Error(`Failed to fetch users: ${response.statusText}`);
      }

      setUsers(response.data.data);
    } catch (error) {
      logError(logger, 'Error fetching users with teams', error, {
        component: 'AdminUsersView',
      });
      setError('Failed to fetch users. Please try again later.');
    } finally {
      setUsersLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchUsers();
    }
  }, [token, fetchUsers]);

  if (!isAuthenticated || authLoading) {
    return <div>Loading...</div>;
  }

  if (!hasRole(UserRole.OWNER)) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>
            You don&apos;t have permission to manage users. Only owners can access user management.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 id="admin-users-title" className="text-2xl font-bold">
          User Management
        </h1>
      </div>

      {/* Error Messages */}
      {error && (
        <Alert>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Users Section */}
      <Card id="users-management-section">
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>Manage users and their team assignments</CardDescription>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table id="users-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Teams</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(user => (
                  <TableRow key={user.id}>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {user.teams?.map(team => (
                          <Badge key={team.id} variant="secondary">
                            {team.name}
                          </Badge>
                        )) || <span className="text-muted-foreground">No teams</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm">
                        Manage Teams
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminUsersView;
