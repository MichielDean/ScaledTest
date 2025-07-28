import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import withAuth from '../auth/withAuth';
import { useAuth } from '../auth/KeycloakProvider';
import { useTeams } from '../contexts/TeamContext';
import { UserRole } from '../auth/keycloak';
import { TestTrendsChart, FlakyTestDetectionChart } from '../components/charts';
import TeamSelector from '../components/TeamSelector';
import styles from '../styles/Dashboard.module.css';

const Dashboard: NextPage = () => {
  const { hasRole, token } = useAuth();
  const { selectedTeams, hasMultipleTeams, loading: teamsLoading, error: teamsError } = useTeams();
  const [content, setContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [newContent, setNewContent] = useState<string>('');
  const [showAnalytics, setShowAnalytics] = useState<boolean>(false);

  useEffect(() => {
    const defaultContent =
      'This is some sample content that can be viewed by all authenticated users.';
    setContent(defaultContent);
    setNewContent(defaultContent);
  }, []);

  // Fetch test reports when token becomes available
  useEffect(() => {
    if (token) {
      fetchTestReports();
    }
  }, [token]);

  // Fetch test reports from OpenSearch for analytics (simplified)
  const fetchTestReports = async () => {
    // This function is kept for compatibility but we're now using individual component calls
  };

  const handleUpdateContent = () => {
    setContent(newContent);
    setIsEditing(false);
  };

  return (
    <div>
      <Head>
        <title>Team Dashboard - ScaledTest</title>
      </Head>

      <Header />

      <main id="main-content" className={styles.main}>
        {/* Team Context Header */}
        <div className={styles.teamContextHeader}>
          <h1 id="dashboard-title" className={styles.title}>
            Team Dashboard
          </h1>

          {teamsError ? (
            <div className={styles.teamError}>⚠️ {teamsError}</div>
          ) : teamsLoading ? (
            <div className={styles.teamLoading}>Loading team data...</div>
          ) : (
            <div className={styles.teamContext}>
              {hasMultipleTeams && (
                <div className={styles.teamSelector}>
                  <label htmlFor="dashboard-team-selector" className={styles.teamSelectorLabel}>
                    Viewing data for:
                  </label>
                  <div id="dashboard-team-selector">
                    <TeamSelector />
                  </div>
                </div>
              )}

              <div className={styles.teamSummary}>
                {selectedTeams.length === 0 ? (
                  <p className={styles.noTeamsSelected}>📊 Viewing demo data (no teams selected)</p>
                ) : selectedTeams.length === 1 ? (
                  <p className={styles.singleTeam}>
                    👥 Viewing data for <strong>{selectedTeams[0]?.name}</strong>
                    {selectedTeams[0]?.description && (
                      <span className={styles.teamDescription}>{selectedTeams[0].description}</span>
                    )}
                  </p>
                ) : (
                  <p className={styles.multipleTeams}>
                    👥 Viewing data for <strong>{selectedTeams.length} teams</strong>:
                    {selectedTeams.map(team => team.name).join(', ')}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Navigation to Other Dashboards */}
        <div className={`card ${styles.dashboardNavigation}`}>
          <h2 className={styles.navigationTitle}>Team Data Views</h2>
          <div className={styles.navigationButtons}>
            <Link
              href="/test-results-dashboard"
              className={styles.dashboardLink}
              aria-label="Go to test results dashboard"
            >
              🌟 Test Results Dashboard
              <span className={styles.linkDescription}>
                View detailed test reports filtered by your teams
              </span>
            </Link>
            <Link
              href="/visualization-playground"
              className={styles.dashboardLink}
              aria-label="Go to visualization playground"
            >
              🎨 Visualization Playground
              <span className={styles.linkDescription}>
                Create custom charts with team-filtered data
              </span>
            </Link>
            <button
              onClick={() => setShowAnalytics(!showAnalytics)}
              className={`${styles.toggleButton} ${showAnalytics ? styles.active : styles.inactive}`}
              aria-label={showAnalytics ? 'Hide analytics dashboard' : 'Show analytics dashboard'}
              aria-expanded={showAnalytics}
            >
              📊 Team Analytics Dashboard
              <span className={styles.linkDescription}>
                Real-time analytics from your team&apos;s test data
              </span>
            </button>
            <button
              disabled
              className={styles.disabledButton}
              aria-label="Performance dashboard feature is coming soon"
            >
              📈 Performance Dashboard (Coming Soon)
              <span className={styles.linkDescription}>Team performance metrics and trends</span>
            </button>
          </div>
        </div>

        {/* Analytics Dashboard Section */}
        {showAnalytics && (
          <div className={styles.analyticsSection}>
            <div className={styles.analyticsHeader}>
              <div className={styles.analyticsHeaderContent}>
                <h2>📊 Team Analytics Dashboard</h2>
                <p>Real-time analytics from your team&apos;s OpenSearch test data</p>
                {selectedTeams.length > 0 && (
                  <div className={styles.analyticsTeamInfo}>
                    <span className={styles.analyticsTeamLabel}>Data Source:</span>
                    <span className={styles.analyticsTeamNames}>
                      {selectedTeams.map(team => team.name).join(', ')}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowAnalytics(false)}
                className={styles.hideButton}
                aria-label="Hide analytics dashboard"
              >
                Hide Analytics
              </button>
            </div>

            {/* Main Analytics Content - Pass team filter */}
            <div className={styles.analyticsCard}>
              <h3 className={styles.analyticsCardTitle}>📈 Test Trends Analysis</h3>
              <TestTrendsChart
                days={7}
                token={token}
                teamIds={selectedTeams.map(team => team.id)}
              />
            </div>

            {/* Flaky Test Detection Card */}
            <div className={styles.analyticsCard}>
              <h3 className={styles.analyticsCardTitle}>🚨 Flaky Test Detection</h3>
              <FlakyTestDetectionChart token={token} teamIds={selectedTeams.map(team => team.id)} />
            </div>
          </div>
        )}

        <div id="content-section" className={`card ${styles.contentSection}`}>
          <div className={styles.contentHeader}>
            <h2>Content Section</h2>
            {(hasRole(UserRole.MAINTAINER) || hasRole(UserRole.OWNER)) && !isEditing && (
              <button
                id="edit-content-button"
                onClick={() => setIsEditing(true)}
                aria-label="Edit content section"
              >
                Edit Content
              </button>
            )}
          </div>

          {isEditing ? (
            <div>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                className={styles.contentTextarea}
              />
              <div className={styles.contentActions}>
                <button
                  onClick={handleUpdateContent}
                  className={styles.saveButton}
                  aria-label="Save content changes"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setNewContent(content);
                  }}
                  className={styles.cancelButton}
                  aria-label="Cancel editing and discard changes"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p>{content}</p>
            </div>
          )}
        </div>

        {hasRole(UserRole.OWNER) && (
          <div id="admin-actions-section" className={`card ${styles.adminSection}`}>
            <h2>Admin Actions</h2>
            <p>This section is only visible to users with the Owner role.</p>
            <button className={styles.resetButton}>Reset Application</button>
          </div>
        )}
      </main>
    </div>
  );
};

// Wrap the Dashboard component with the withAuth HOC to protect this route
export default withAuth(Dashboard);
