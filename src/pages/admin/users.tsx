import { NextPage } from 'next';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../auth/KeycloakProvider';
import { withAuth } from '../../auth/withAuth';
import { UserRole } from '../../auth/keycloak';
import Header from '../../components/Header';
import axios from 'axios';
import { uiLogger as logger, logError } from '../../utils/logger';
import { UserWithRoles } from '../../types/user';

const UserManagement: NextPage = () => {
  const { keycloak, isAuthenticated, hasRole, loading: authLoading, token } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check if user has owner role and redirect if not
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      // Check if user has required owner role
      if (!hasRole(UserRole.OWNER)) {
        router.push('/login');
      }
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, hasRole, router]);

  // Fetch all users from our server-side API endpoint
  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await axios.get('/api/admin/users', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status !== 200) {
        throw new Error(`Failed to fetch users: ${response.statusText}`);
      }

      setUsers(response.data);
    } catch (error) {
      logError(logger, 'Error fetching users', error, {
        component: 'AdminUsersPage',
      });
      setError('Failed to fetch users. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Update user role through our server-side API endpoint
  const updateUserRole = async (userId: string, grantMaintainer: boolean) => {
    try {
      setError(null);
      setSuccessMessage(null);

      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await axios.post(
        '/api/admin/users',
        {
          userId,
          grantMaintainer,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status !== 200) {
        throw new Error('Failed to update user role');
      }

      setSuccessMessage(
        grantMaintainer
          ? 'Successfully granted maintainer role'
          : 'Successfully revoked maintainer role'
      );

      // Refresh user list
      await fetchUsers();
    } catch (error) {
      logError(logger, 'Error updating user role', error, {
        component: 'AdminUsersPage',
        userId,
        grantMaintainer,
      });
      setError('Failed to update user role. Please try again later.');
    }
  };

  useEffect(() => {
    if (keycloak) {
      fetchUsers();
    }
  }, [keycloak]);

  return (
    <div>
      <Head>
        <title>User Management - Admin</title>
      </Head>

      <Header />

      <main className="container" style={{ padding: '2rem' }}>
        <h1 id="page-title">User Management</h1>
        <p>Manage user roles and permissions</p>

        {error && (
          <div
            id="error-message"
            style={{
              padding: '1rem',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderRadius: '0.25rem',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        {successMessage && (
          <div
            id="success-message"
            style={{
              padding: '1rem',
              backgroundColor: '#d4edda',
              color: '#155724',
              borderRadius: '0.25rem',
              marginBottom: '1rem',
            }}
          >
            {successMessage}
          </div>
        )}

        {loading ? (
          <div>Loading users...</div>
        ) : (
          <div>
            <table
              id="users-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginTop: '1rem',
                border: '1px solid #ddd',
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#f2f2f2' }}>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      borderBottom: '2px solid #ddd',
                    }}
                  >
                    Email
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      borderBottom: '2px solid #ddd',
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      borderBottom: '2px solid #ddd',
                    }}
                  >
                    Roles
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'center',
                      borderBottom: '2px solid #ddd',
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr
                    key={user.id}
                    id={`user-row-${user.id}`}
                    style={{ borderBottom: '1px solid #ddd' }}
                  >
                    <td style={{ padding: '0.75rem' }}>{user.email}</td>
                    <td style={{ padding: '0.75rem' }}>
                      {user.firstName || ''} {user.lastName || ''}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {user.roles.map(role => (
                        <span
                          key={role}
                          id={`user-role-${role.toLowerCase()}`}
                          style={{ display: 'inline-block', marginRight: '0.5rem' }}
                        >
                          {role}
                        </span>
                      ))}
                      {user.roles.length === 0 && 'No roles'}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      {user.isMaintainer ? (
                        <button
                          onClick={() => updateUserRole(user.id, false)}
                          style={{
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            padding: '0.375rem 0.75rem',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                          }}
                        >
                          Revoke Maintainer
                        </button>
                      ) : (
                        <button
                          onClick={() => updateUserRole(user.id, true)}
                          style={{
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            padding: '0.375rem 0.75rem',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                          }}
                        >
                          Grant Maintainer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {users.length === 0 && (
              <div style={{ textAlign: 'center', marginTop: '2rem' }}>No users found</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

// Export with withAuth HOC to protect this page
export default withAuth(UserManagement, {
  requiredRoles: [UserRole.OWNER],
  redirectTo: '/login',
});
