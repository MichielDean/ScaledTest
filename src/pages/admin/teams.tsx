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
import { TeamWithMemberCount, CreateTeamRequest, TeamPermissions } from '../../types/team';
import styles from '../../styles/AdminTeams.module.css';
import sharedButtons from '../../styles/shared/buttons.module.css';
import sharedAlerts from '../../styles/shared/alerts.module.css';

interface TeamsResponse {
  success: boolean;
  data: TeamWithMemberCount[];
  permissions: TeamPermissions;
}

const TeamManagement: NextPage = () => {
  const { keycloak, isAuthenticated, hasRole, loading: authLoading, token } = useAuth();
  const router = useRouter();
  const [teams, setTeams] = useState<TeamWithMemberCount[]>([]);
  const [permissions, setPermissions] = useState<TeamPermissions>({
    canCreateTeam: false,
    canDeleteTeam: false,
    canAssignUsers: false,
    canViewAllTeams: false,
    assignableTeams: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createFormData, setCreateFormData] = useState<CreateTeamRequest>({
    name: '',
    description: '',
  });

  // Check if user has owner role and redirect if not
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      // Check if user has required maintainer or owner role
      if (!hasRole(UserRole.MAINTAINER) && !hasRole(UserRole.OWNER)) {
        router.push('/unauthorized');
      }
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, hasRole, router]);

  // Fetch all teams from our server-side API endpoint
  const fetchTeams = useCallback(async () => {
    try {
      setLoading(true);
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
        component: 'AdminTeamsPage',
      });
      setError('Failed to fetch teams. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Create a new team
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

      // Refresh teams list
      await fetchTeams();
    } catch (error) {
      logError(logger, 'Error creating team', error, {
        component: 'AdminTeamsPage',
        teamData: createFormData,
      });

      if (axios.isAxiosError(error) && error.response?.data?.error) {
        setError(error.response.data.error);
      } else {
        setError('Failed to create team. Please try again later.');
      }
    }
  };

  // Delete a team
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

      setSuccessMessage(`Team "${teamName}" deleted successfully`);

      // Refresh teams list
      await fetchTeams();
    } catch (error) {
      logError(logger, 'Error deleting team', error, {
        component: 'AdminTeamsPage',
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

  useEffect(() => {
    if (keycloak) {
      fetchTeams();
    }
  }, [keycloak, fetchTeams]);

  return (
    <div>
      <Head>
        <title>Team Management - Admin</title>
      </Head>

      <Header />

      <main id="main-content" className={`container ${styles.mainContent}`}>
        <div className={styles.header}>
          <h1 id="page-title">Team Management</h1>
          <p>Manage teams and user assignments</p>

          {permissions.canCreateTeam && (
            <button
              id="create-team-button"
              onClick={() => setShowCreateForm(!showCreateForm)}
              className={sharedButtons.primaryButton}
              aria-expanded={showCreateForm}
              aria-controls="create-team-form"
            >
              {showCreateForm ? 'Cancel' : 'Create Team'}
            </button>
          )}
        </div>

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

        {showCreateForm && permissions.canCreateTeam && (
          <form
            id="create-team-form"
            onSubmit={createTeam}
            className={styles.createForm}
            aria-labelledby="create-form-title"
          >
            <h2 id="create-form-title">Create New Team</h2>

            <div className={styles.formGroup}>
              <label htmlFor="team-name" className={styles.formLabel}>
                Team Name *
              </label>
              <input
                id="team-name"
                type="text"
                value={createFormData.name}
                onChange={e => setCreateFormData({ ...createFormData, name: e.target.value })}
                className={styles.formInput}
                maxLength={50}
                required
                aria-describedby="team-name-help"
              />
              <small id="team-name-help" className={styles.helpText}>
                Team name can contain letters, numbers, spaces, hyphens, and underscores (max 50
                characters)
              </small>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="team-description" className={styles.formLabel}>
                Description
              </label>
              <textarea
                id="team-description"
                value={createFormData.description}
                onChange={e =>
                  setCreateFormData({ ...createFormData, description: e.target.value })
                }
                className={styles.formTextarea}
                maxLength={255}
                rows={3}
                aria-describedby="team-description-help"
              />
              <small id="team-description-help" className={styles.helpText}>
                Optional description for the team (max 255 characters)
              </small>
            </div>

            <div className={styles.formActions}>
              <button
                type="submit"
                className={sharedButtons.primaryButton}
                disabled={!createFormData.name.trim()}
              >
                Create Team
              </button>
              <button
                type="button"
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

        {loading ? (
          <div role="status" aria-live="polite">
            <span className="sr-only">Loading team data...</span>
            Loading teams...
          </div>
        ) : (
          <div>
            <h2 id="teams-table-caption" className="sr-only">
              Teams Management Table
            </h2>
            <table
              id="teams-table"
              role="table"
              aria-labelledby="teams-table-caption"
              aria-describedby="teams-table-description"
              className={styles.teamsTable}
            >
              <caption id="teams-table-description" className="sr-only">
                Table showing all teams with their names, descriptions, member counts, and available
                actions. Use Tab to navigate between table cells and buttons.
              </caption>
              <thead>
                <tr className={styles.tableHeader}>
                  <th scope="col" className={styles.tableHeaderCell}>
                    Team Name
                  </th>
                  <th scope="col" className={styles.tableHeaderCell}>
                    Description
                  </th>
                  <th scope="col" className={styles.tableHeaderCell}>
                    Members
                  </th>
                  <th scope="col" className={styles.tableHeaderCell}>
                    Default
                  </th>
                  {permissions.canDeleteTeam && (
                    <th scope="col" className={styles.tableHeaderCellCenter}>
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {teams.map(team => (
                  <tr key={team.id} id={`team-row-${team.id}`} className={styles.tableRow}>
                    <td className={styles.tableCell}>
                      <strong>{team.name}</strong>
                    </td>
                    <td className={styles.tableCell}>
                      {team.description || (
                        <span className={styles.emptyDescription}>No description</span>
                      )}
                    </td>
                    <td className={styles.tableCell}>
                      <span id={`team-member-count-${team.id}`}>
                        {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}
                      </span>
                    </td>
                    <td className={styles.tableCell}>
                      {team.isDefault ? (
                        <span className={styles.defaultTeamBadge} aria-label="Default team">
                          ✓ Default
                        </span>
                      ) : (
                        <span className="sr-only">Not default</span>
                      )}
                    </td>
                    {permissions.canDeleteTeam && (
                      <td className={styles.tableCellCenter}>
                        {!team.isDefault ? (
                          <button
                            onClick={() => deleteTeam(team.id, team.name)}
                            className={sharedButtons.dangerButton}
                            tabIndex={0}
                            aria-label={`Delete team ${team.name}`}
                            aria-describedby={`team-member-count-${team.id}`}
                          >
                            Delete
                          </button>
                        ) : (
                          <span
                            className={styles.cannotDelete}
                            aria-label="Cannot delete default team"
                          >
                            Protected
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {teams.length === 0 && <div className={styles.noTeams}>No teams found</div>}
          </div>
        )}
      </main>
    </div>
  );
};

// Export with withAuth HOC to protect this page
export default withAuth(TeamManagement, {
  requiredRoles: [UserRole.MAINTAINER, UserRole.OWNER],
  redirectTo: '/unauthorized',
});
