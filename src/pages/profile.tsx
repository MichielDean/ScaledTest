import type { NextPage } from 'next';
import Head from 'next/head';
import { useAuth } from '../auth/KeycloakProvider';
import { UserRole } from '../auth/keycloak';
import Header from '../components/Header';
import withAuth from '../auth/withAuth';
import styles from '../styles/Profile.module.css';

const Profile: NextPage = () => {
  const { userProfile, hasRole } = useAuth();

  return (
    <div>
      <Head>
        <title>User Profile - Keycloak Auth Demo</title>
      </Head>

      <Header />

      <main className={styles.main}>
        <h1 className={styles.title}>User Profile</h1>

        <div className={`card ${styles.userProfileSection}`}>
          <div className={styles.profileHeader}>
            <h2>Profile Information</h2>
          </div>

          <div className={styles.profileInfo}>
            <p>
              <strong>Username:</strong> {userProfile?.username || 'N/A'}
            </p>
            <p>
              <strong>Name:</strong> {userProfile?.firstName || ''} {userProfile?.lastName || ''}
            </p>
            <p>
              <strong>Email:</strong> {userProfile?.email || 'N/A'}
            </p>
            <p>
              <strong>Roles:</strong>
            </p>
            <ul id="user-roles-list" className={styles.rolesList}>
              {hasRole(UserRole.READONLY) && <li id="role-readonly">Read-only</li>}
              {hasRole(UserRole.MAINTAINER) && <li id="role-maintainer">Maintainer</li>}
              {hasRole(UserRole.OWNER) && <li id="role-owner">Owner</li>}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
};

// Wrap the Profile component with the withAuth HOC to protect this route
export default withAuth(Profile);
