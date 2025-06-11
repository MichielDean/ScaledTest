import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import withAuth from '../auth/withAuth';
import { useAuth } from '../auth/KeycloakProvider';
import { UserRole } from '../auth/keycloak';
import { TestTrendsChart } from '../components/charts';
import styles from '../styles/Dashboard.module.css';

const Dashboard: NextPage = () => {
  const { hasRole, token } = useAuth();
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
        <title>Dashboard - Keycloak Auth Demo</title>
        <style jsx>{`
          @keyframes spin {
            0% {
              transform: rotate(0deg);
            }
            100% {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </Head>

      <Header />

      <main id="main-content" className={styles.main}>
        <h1 className={styles.title}>Dashboard</h1>

        {/* Navigation to Other Dashboards */}
        <div className={`card ${styles.dashboardNavigation}`}>
          <h2 className={styles.navigationTitle}>Available Dashboards</h2>
          <div className={styles.navigationButtons}>
            <Link
              href="/test-results-dashboard"
              className={styles.dashboardLink}
              aria-label="Go to test results dashboard"
            >
              🌟 Test Results Dashboard
            </Link>
            <button
              onClick={() => setShowAnalytics(!showAnalytics)}
              className={`${styles.toggleButton} ${showAnalytics ? styles.active : styles.inactive}`}
              aria-label={showAnalytics ? 'Hide analytics dashboard' : 'Show analytics dashboard'}
              aria-expanded={showAnalytics}
            >
              📊 Analytics Dashboard (OpenSearch)
            </button>
            <button
              disabled
              className={styles.disabledButton}
              aria-label="Performance dashboard feature is coming soon"
            >
              📈 Performance Dashboard (Coming Soon)
            </button>
          </div>
        </div>

        {/* Analytics Dashboard Section */}
        {showAnalytics && (
          <div className={styles.analyticsSection}>
            <div className={styles.analyticsHeader}>
              <div className={styles.analyticsHeaderContent}>
                <h2>📊 Analytics Dashboard</h2>
                <p>Real-time analytics from OpenSearch test data</p>
              </div>
              <button
                onClick={() => setShowAnalytics(false)}
                className={styles.hideButton}
                aria-label="Hide analytics dashboard"
              >
                Hide Analytics
              </button>
            </div>

            {/* Main Analytics Content */}
            <div className={styles.analyticsCard}>
              <h3 className={styles.analyticsCardTitle}>📈 Test Trends Analysis</h3>
              <TestTrendsChart days={7} token={token} />
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
