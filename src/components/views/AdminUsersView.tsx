import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../types/roles';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';

const AdminUsersView: React.FC = () => {
  const { isAuthenticated, hasRole, loading: authLoading, token } = useAuth();

  // Users state
  const [users, setUsers] = useState<UserWithTeams[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Fetch users with teams
  const fetchUsers = useCallback(async () => {
    try {
      setUsersLoading(true);
      setError(null);

      // Better Auth uses cookie-based authentication, no need for Bearer tokens
      const response = await fetch('/api/teams?users=true', {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Important: include cookies
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch users: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      logger.debug('User fetch API response', { userCount: data.data?.length || 0 });
      setUsers(data.data || []);
    } catch (err) {
      logger.error('Failed to fetch users', { error: err });
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setUsersLoading(false);
    }
  }, []); // Delete user function
  const handleDeleteUser = useCallback(
    async (userId: string, username: string) => {
      try {
        setDeletingUserId(userId);
        setError(null);

        if (!token) {
          throw new Error('No authentication token available');
        }

        const response = await axios.delete(`/api/admin/users?userId=${userId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.status !== 200) {
          throw new Error(`Failed to delete user: ${response.statusText}`);
        }

        // Remove user from local state
        setUsers(prevUsers => prevUsers.filter(user => user.id !== userId));

        logger.info('User deleted successfully', {
          userId,
          username,
          component: 'AdminUsersView',
        });
      } catch (error) {
        logError(logger, 'Error deleting user', error, {
          userId,
          username,
          component: 'AdminUsersView',
        });

        if (axios.isAxiosError(error)) {
          if (error.response?.status === 404) {
            setError('User not found');
          } else if (error.response?.status === 403) {
            setError('Insufficient permissions to delete user');
          } else {
            setError(error.response?.data?.error || 'Failed to delete user');
          }
        } else {
          setError('Failed to delete user. Please try again later.');
        }
      } finally {
        setDeletingUserId(null);
      }
    },
    [token]
  );

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
            <>
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
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deletingUserId === user.id}
                              id={`delete-user-${user.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {deletingUserId === user.id ? 'Deleting...' : 'Delete User'}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete User</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete user{' '}
                                <strong>{user.username}</strong> ({user.email})?
                                <br />
                                <br />
                                This action cannot be undone. The user will be permanently removed
                                from the system and will lose access to the application.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteUser(user.id, user.username)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete User
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminUsersView;
