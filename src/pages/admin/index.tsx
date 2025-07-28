import { NextPage } from 'next';
import Head from 'next/head';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../auth/KeycloakProvider';
import { withAuth } from '../../auth/withAuth';
import { UserRole } from '../../auth/keycloak';
import Header from '../../components/Header';
import axios from 'axios';
import { uiLogger as logger, logError } from '../../logging/logger';
import {
  UserWithTeams,
  TeamWithMemberCount,
  Team,
  CreateTeamRequest,
  TeamPermissions,
} from '../../types/team';
import styles from '../../styles/AdminDashboard.module.css';
import sharedButtons from '../../styles/shared/buttons.module.css';
import sharedAlerts from '../../styles/shared/alerts.module.css';

type AdminSection = 'users' | 'teams';

interface TeamsResponse {
  success: boolean;
  data: TeamWithMemberCount[];
  permissions: TeamPermissions;
}

const AdminDashboard: NextPage = () => {
  const { keycloak, isAuthenticated, hasRole, loading: authLoading, token } = useAuth();
  const router = useRouter();

  // Navigation state - default to teams for maintainers, users for owners
  const [activeSection, setActiveSection] = useState<AdminSection>('teams');

  // Initialize section from URL parameter and role permissions
  useEffect(() => {
    // Skip if auth is still loading
    if (authLoading || !isAuthenticated) return;

    const section = router.query.section as AdminSection;
    if (section && (section === 'users' || section === 'teams')) {
      // Only allow users section if user is an owner
      if (section === 'users' && !hasRole(UserRole.OWNER)) {
        router.replace('/admin?section=teams', undefined, { shallow: true });
        setActiveSection('teams');
      } else {
        setActiveSection(section);
      }
    } else {
      // Set default section based on role
      const defaultSection = hasRole(UserRole.OWNER) ? 'users' : 'teams';
      setActiveSection(defaultSection);
      router.replace(`/admin?section=${defaultSection}`, undefined, { shallow: true });
    }
  }, [router.query.section, hasRole, authLoading, isAuthenticated, router]);

  // Users state
  const [users, setUsers] = useState<UserWithTeams[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

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
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createFormData, setCreateFormData] = useState<CreateTeamRequest>({
    name: '',
    description: '',
  });

  // Shared state
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [teamAssignmentLoading, setTeamAssignmentLoading] = useState<string | null>(null);

  // Check authentication and authorization
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      if (!hasRole(UserRole.MAINTAINER) && !hasRole(UserRole.OWNER)) {
        router.push('/unauthorized');
      }
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, hasRole, router]);

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
        component: 'AdminDashboard',
      });
      setError('Failed to fetch users. Please try again later.');
    } finally {
      setUsersLoading(false);
    }
  }, [token]);

  // Fetch teams
  const fetchTeams = useCallback(async () => {
    try {
      setTeamsLoading(true);
      setError(null);

      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await axios.get<TeamsResponse>('/api/admin/teams', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status !== 200 || !response.data.success) {
        throw new Error(`Failed to fetch teams: ${response.statusText}`);
      }

      setTeams(response.data.data);
      setPermissions(response.data.permissions);
    } catch (error) {
      logError(logger, 'Error fetching teams', error, {
        component: 'AdminDashboard',
      });
      setError('Failed to fetch teams. Please try again later.');
    } finally {
      setTeamsLoading(false);
    }
  }, [token]);

  // Load data when section changes
  useEffect(() => {
    if (keycloak && token) {
      if (activeSection === 'users') {
        fetchUsers();
        fetchTeams(); // Need teams for user assignment
      } else if (activeSection === 'teams') {
        fetchTeams();
      }
    }
  }, [keycloak, token, activeSection, fetchUsers, fetchTeams]);

  // User management functions
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

      await fetchUsers();
    } catch (error) {
      logError(logger, 'Error updating user role', error, {
        component: 'AdminDashboard',
        userId,
        grantMaintainer,
      });
      setError('Failed to update user role. Please try again later.');
    }
  };

  const assignUserToTeam = async (userId: string, teamId: string) => {
    try {
      setError(null);
      setSuccessMessage(null);
      setTeamAssignmentLoading(`${userId}-${teamId}`);

      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await axios.post(
        '/api/admin/team-assignments',
        {
          userId,
          teamId,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status !== 200) {
        throw new Error('Failed to assign user to team');
      }

      setSuccessMessage('Successfully assigned user to team');
      await fetchUsers();
    } catch (error) {
      logError(logger, 'Error assigning user to team', error, {
        component: 'AdminDashboard',
        userId,
        teamId,
      });
      setError('Failed to assign user to team. Please try again later.');
    } finally {
      setTeamAssignmentLoading(null);
    }
  };

  const removeUserFromTeam = async (userId: string, teamId: string) => {
    try {
      setError(null);
      setSuccessMessage(null);
      setTeamAssignmentLoading(`${userId}-${teamId}`);

      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await axios.delete('/api/admin/team-assignments', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        data: {
          userId,
          teamId,
        },
      });

      if (response.status !== 200) {
        throw new Error('Failed to remove user from team');
      }

      setSuccessMessage('Successfully removed user from team');
      await fetchUsers();
    } catch (error) {
      logError(logger, 'Error removing user from team', error, {
        component: 'AdminDashboard',
        userId,
        teamId,
      });
      setError('Failed to remove user from team. Please try again later.');
    } finally {
      setTeamAssignmentLoading(null);
    }
  };

  // Team management functions
  const createTeam = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      setError(null);
      setSuccessMessage(null);

      if (!token) {
        throw new Error('No authentication token available');
      }

      if (!createFormData.name.trim()) {
        setError('Team name is required');
        return;
      }

      const response = await axios.post('/api/admin/teams', createFormData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status !== 201 || !response.data.success) {
        throw new Error('Failed to create team');
      }

      setSuccessMessage(response.data.message);
      setShowCreateForm(false);
      setCreateFormData({ name: '', description: '' });
      await fetchTeams();
    } catch (error) {
      logError(logger, 'Error creating team', error, {
        component: 'AdminDashboard',
        teamData: createFormData,
      });

      if (axios.isAxiosError(error) && error.response?.data?.error) {
        setError(error.response.data.error);
      } else {
        setError('Failed to create team. Please try again later.');
      }
    }
  };

  const deleteTeam = async (teamId: string, teamName: string) => {
    if (
      !confirm(
        `Are you sure you want to delete the team "${teamName}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setError(null);
      setSuccessMessage(null);

      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await axios.delete(`/api/admin/teams?teamId=${teamId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status !== 200 || !response.data.success) {
        throw new Error('Failed to delete team');
      }

      setSuccessMessage(response.data.message);
      await fetchTeams();
    } catch (error) {
      logError(logger, 'Error deleting team', error, {
        component: 'AdminDashboard',
        teamId,
        teamName,
      });

      if (axios.isAxiosError(error) && error.response?.data?.error) {
        setError(error.response.data.error);
      } else {
        setError('Failed to delete team. Please try again later.');
      }
    }
  };

  const renderUsersSection = () => (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 id="users-section-title">User & Team Management</h2>
        <p>Manage user roles, permissions, and team assignments</p>
      </div>

      {usersLoading ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading user data...</span>
          Loading users...
        </div>
      ) : (
        <div>
          <h3 id="users-table-caption" className="sr-only">
            User and Team Management Table
          </h3>
          <table
            id="users-table"
            role="table"
            aria-labelledby="users-table-caption"
            aria-describedby="users-table-description"
            className={styles.usersTable}
          >
            <caption id="users-table-description" className="sr-only">
              Table showing all registered users with their email, name, assigned roles, team
              assignments, and available actions for role and team management. Use Tab to navigate
              between table cells and buttons.
            </caption>
            <thead>
              <tr className={styles.tableHeader}>
                <th scope="col" className={styles.tableHeaderCell}>
                  User Details
                </th>
                <th scope="col" className={styles.tableHeaderCell}>
                  Roles
                </th>
                <th scope="col" className={styles.tableHeaderCell}>
                  Team Assignments
                </th>
                <th scope="col" className={styles.tableHeaderCellCenter}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} id={`user-row-${user.id}`} className={styles.tableRow}>
                  <td className={styles.tableCell}>
                    <div className={styles.userDetails}>
                      <div className={styles.userEmail}>{user.email}</div>
                      <div className={styles.userName}>
                        {user.firstName || ''} {user.lastName || ''}
                      </div>
                    </div>
                  </td>
                  <td className={styles.tableCell}>
                    <div aria-label="User roles">
                      {user.roles.length > 0 ? (
                        user.roles.map((role: string) => (
                          <span
                            key={`${user.id}-${role}`}
                            id={`user-role-${user.id}-${role.toLowerCase()}`}
                            className={styles.roleTag}
                          >
                            {role}
                          </span>
                        ))
                      ) : (
                        <span>No roles</span>
                      )}
                    </div>
                  </td>
                  <td className={styles.tableCell}>
                    <div className={styles.teamAssignments}>
                      <div aria-label="Assigned teams">
                        {user.teams?.length > 0 ? (
                          user.teams.map((team: Team) => (
                            <div key={`${user.id}-${team.id}`} className={styles.teamAssignment}>
                              <span
                                id={`user-team-${user.id}-${team.id}`}
                                className={`${styles.teamTag} ${team.isDefault ? styles.defaultTeam : ''}`}
                              >
                                {team.name}
                                {team.isDefault && ' (Default)'}
                              </span>
                              {!team.isDefault && (
                                <button
                                  onClick={() => removeUserFromTeam(user.id, team.id)}
                                  disabled={teamAssignmentLoading === `${user.id}-${team.id}`}
                                  className={styles.removeTeamButton}
                                  aria-label={`Remove ${user.email} from team ${team.name}`}
                                  title="Remove from team"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))
                        ) : (
                          <span>No teams assigned</span>
                        )}
                      </div>

                      <div className={styles.teamActions}>
                        <select
                          id={`team-selector-${user.id}`}
                          className={styles.teamSelector}
                          onChange={e => {
                            if (e.target.value) {
                              assignUserToTeam(user.id, e.target.value);
                              e.target.value = ''; // Reset selector
                            }
                          }}
                          aria-label={`Assign ${user.email} to a team`}
                        >
                          <option value="">Add to team...</option>
                          {teams
                            .filter(team => !user.teams?.some(userTeam => userTeam.id === team.id))
                            .map(team => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  </td>
                  <td className={styles.tableCellCenter}>
                    <div className={styles.actionButtons}>
                      {user.isMaintainer ? (
                        <button
                          id={`revoke-maintainer-${user.id}`}
                          onClick={() => updateUserRole(user.id, false)}
                          className={sharedButtons.revokeButton}
                          tabIndex={0}
                          aria-label={`Revoke maintainer role from ${user.email}`}
                          aria-describedby={`user-role-maintainer-${user.id}`}
                        >
                          Revoke Maintainer
                        </button>
                      ) : (
                        <button
                          id={`grant-maintainer-${user.id}`}
                          onClick={() => updateUserRole(user.id, true)}
                          className={sharedButtons.grantButton}
                          tabIndex={0}
                          aria-label={`Grant maintainer role to ${user.email}`}
                          aria-describedby={`user-role-maintainer-${user.id}`}
                        >
                          Grant Maintainer
                        </button>
                      )}
                      <span id={`user-role-maintainer-${user.id}`} className="sr-only">
                        Current status:{' '}
                        {user.isMaintainer ? 'Has maintainer role' : 'No maintainer role'}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && <div className={styles.noUsers}>No users found</div>}
        </div>
      )}
    </div>
  );

  const renderTeamsSection = () => (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 id="teams-section-title">Team Management</h2>
        <p>Create and manage teams for organizing users and permissions</p>

        {permissions.canCreateTeam && (
          <button
            id="toggle-create-team-form"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className={sharedButtons.primaryButton}
            aria-expanded={showCreateForm}
            aria-controls="create-team-form"
          >
            {showCreateForm ? 'Cancel' : 'Create New Team'}
          </button>
        )}
      </div>

      {showCreateForm && (
        <form
          id="create-team-form"
          onSubmit={createTeam}
          className={styles.createForm}
          aria-labelledby="create-team-form-title"
        >
          <h3 id="create-team-form-title">Create New Team</h3>

          <div className={styles.formGroup}>
            <label htmlFor="team-name" className={styles.formLabel}>
              Team Name*
            </label>
            <input
              type="text"
              id="team-name"
              value={createFormData.name}
              onChange={e => setCreateFormData({ ...createFormData, name: e.target.value })}
              className={styles.formInput}
              required
              aria-describedby="team-name-description"
            />
            <div id="team-name-description" className="sr-only">
              Enter a unique name for the team
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="team-description" className={styles.formLabel}>
              Description
            </label>
            <textarea
              id="team-description"
              value={createFormData.description}
              onChange={e => setCreateFormData({ ...createFormData, description: e.target.value })}
              className={styles.formTextarea}
              rows={3}
              aria-describedby="team-description-description"
            />
            <div id="team-description-description" className="sr-only">
              Optional description of the team&apos;s purpose
            </div>
          </div>

          <div className={styles.formActions}>
            <button type="submit" id="submit-create-team" className={sharedButtons.primaryButton}>
              Create Team
            </button>
            <button
              type="button"
              id="cancel-create-team"
              onClick={() => {
                setShowCreateForm(false);
                setCreateFormData({ name: '', description: '' });
              }}
              className={sharedButtons.secondaryButton}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {teamsLoading ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading teams data...</span>
          Loading teams...
        </div>
      ) : (
        <div>
          <h3 id="teams-table-caption" className="sr-only">
            Teams Management Table
          </h3>
          <table
            id="teams-table"
            role="table"
            aria-labelledby="teams-table-caption"
            aria-describedby="teams-table-description"
            className={styles.teamsTable}
          >
            <caption id="teams-table-description" className="sr-only">
              Table showing all teams with their name, description, member count, and available
              actions for team management. Use Tab to navigate between table cells and buttons.
            </caption>
            <thead>
              <tr className={styles.tableHeader}>
                <th scope="col" className={styles.tableHeaderCell}>
                  Team Name
                </th>
                <th scope="col" className={styles.tableHeaderCell}>
                  Description
                </th>
                <th scope="col" className={styles.tableHeaderCellCenter}>
                  Members
                </th>
                <th scope="col" className={styles.tableHeaderCellCenter}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {teams.map(team => (
                <tr key={team.id} id={`team-row-${team.id}`} className={styles.tableRow}>
                  <td className={styles.tableCell}>
                    <div className={styles.teamInfo}>
                      <span className={styles.teamName}>{team.name}</span>
                      {team.isDefault && <span className={styles.defaultBadge}>Default</span>}
                    </div>
                  </td>
                  <td className={styles.tableCell}>
                    <span className={styles.teamDescription}>
                      {team.description || 'No description'}
                    </span>
                  </td>
                  <td className={styles.tableCellCenter}>
                    <span id={`team-member-count-${team.id}`} className={styles.memberCount}>
                      {team.memberCount}
                    </span>
                  </td>
                  <td className={styles.tableCellCenter}>
                    <div className={styles.actionButtons}>
                      {permissions.canDeleteTeam && !team.isDefault && (
                        <button
                          id={`delete-team-${team.id}`}
                          onClick={() => deleteTeam(team.id, team.name)}
                          className={sharedButtons.dangerButton}
                          tabIndex={0}
                          aria-label={`Delete team ${team.name}`}
                          aria-describedby={`team-member-count-${team.id}`}
                        >
                          Delete
                        </button>
                      )}
                      {team.isDefault && (
                        <span className={styles.defaultTeamNote}>Cannot delete default team</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {teams.length === 0 && <div className={styles.noTeams}>No teams found</div>}
        </div>
      )}
    </div>
  );

  return (
    <div className={styles.container}>
      <Head>
        <title>Admin Dashboard - ScaledTest</title>
      </Head>

      <Header />

      <div className={styles.layout}>
        {/* Sidebar Navigation */}
        <nav className={styles.sidebar} aria-label="Admin navigation">
          <h2 id="admin-nav-title" className={styles.sidebarTitle}>
            Admin Panel
          </h2>
          <ul className={styles.sidebarNav} role="list" aria-labelledby="admin-nav-title">
            {hasRole(UserRole.OWNER) && (
              <li role="listitem">
                <button
                  id="nav-users"
                  onClick={() => {
                    setActiveSection('users');
                    router.replace('/admin?section=users', undefined, { shallow: true });
                  }}
                  className={`${styles.navButton} ${activeSection === 'users' ? styles.navButtonActive : ''}`}
                  aria-current={activeSection === 'users' ? 'page' : undefined}
                >
                  <span className={styles.navIcon}>👥</span>
                  Users
                </button>
              </li>
            )}
            <li role="listitem">
              <button
                id="nav-teams"
                onClick={() => {
                  setActiveSection('teams');
                  router.replace('/admin?section=teams', undefined, { shallow: true });
                }}
                className={`${styles.navButton} ${activeSection === 'teams' ? styles.navButtonActive : ''}`}
                aria-current={activeSection === 'teams' ? 'page' : undefined}
              >
                <span className={styles.navIcon}>🏢</span>
                Teams
              </button>
            </li>
          </ul>
        </nav>

        {/* Main Content */}
        <main id="main-content" className={styles.mainContent}>
          <h1 className={styles.pageTitle}>
            {activeSection === 'users' ? 'User Management' : 'Team Management'}
          </h1>

          {error && (
            <div
              id="error-message"
              className={`${sharedAlerts.alert} ${sharedAlerts.alertError}`}
              role="alert"
              aria-live="polite"
            >
              {error}
            </div>
          )}

          {successMessage && (
            <div
              id="success-message"
              className={`${sharedAlerts.alert} ${sharedAlerts.alertSuccess}`}
              role="alert"
              aria-live="polite"
            >
              {successMessage}
            </div>
          )}

          {activeSection === 'users' && hasRole(UserRole.OWNER) && renderUsersSection()}
          {activeSection === 'teams' && renderTeamsSection()}
        </main>
      </div>
    </div>
  );
};

export default withAuth(AdminDashboard, {
  requiredRoles: [UserRole.MAINTAINER, UserRole.OWNER],
  redirectTo: '/unauthorized',
});
