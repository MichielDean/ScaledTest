import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../auth/KeycloakProvider';
import { UserRole } from '../auth/keycloak';
import TeamSelector from './TeamSelector';
import styles from '../styles/Header.module.css';

const Header: React.FC = () => {
  const { isAuthenticated, userProfile, logout, hasRole } = useAuth();
  const router = useRouter();

  return (
    <>
      {/* Skip Navigation Link for keyboard users */}
      <a href="#main-content" className={`skip-link ${styles.skipLink}`}>
        Skip to main content
      </a>

      <header className={`header ${styles.header}`} role="banner">
        <div>
          <Link href="/" aria-label="Go to ScaledTest home page">
            <span className={styles.logo}>ScaledTest</span>
          </Link>
        </div>

        <nav className="navigation" role="navigation" aria-label="Main navigation">
          {isAuthenticated ? (
            <>
              <Link
                id="headerHome"
                href="/"
                aria-label="Go to home page"
                aria-current={router.pathname === '/' ? 'page' : undefined}
              >
                Home
              </Link>
              <Link
                id="headerDashboard"
                href="/dashboard"
                aria-label="Go to dashboard page"
                aria-current={router.pathname === '/dashboard' ? 'page' : undefined}
              >
                Dashboard
              </Link>
              <Link
                id="headerProfile"
                href="/profile"
                aria-label="Go to user profile page"
                aria-current={router.pathname === '/profile' ? 'page' : undefined}
              >
                Profile
              </Link>

              {/* Team Selector - prominently displayed */}
              <div className={styles.teamSection}>
                <TeamSelector compact />
              </div>

              {/* Admin section for owners and maintainers */}
              {(hasRole(UserRole.OWNER) || hasRole(UserRole.MAINTAINER)) && (
                <div className={styles.adminSection}>
                  <span className={styles.adminLabel}>Admin:</span>
                  <Link id="headerAdminDashboard" href="/admin" aria-label="Go to admin dashboard">
                    Admin Dashboard
                  </Link>
                </div>
              )}

              <div className={styles.userSection}>
                <span id="headerGreeting">
                  Hello, {userProfile?.firstName || userProfile?.username || 'User'}
                </span>
                <button id="headerLogOut" onClick={logout} aria-label="Logout from the application">
                  Logout
                </button>
              </div>
            </>
          ) : (
            <>
              <Link id="headerLogin" href="/login" aria-label="Go to login page">
                Login
              </Link>
              <Link id="headerRegister" href="/register" aria-label="Go to registration page">
                Register
              </Link>
            </>
          )}
        </nav>
      </header>
    </>
  );
};

export default Header;
