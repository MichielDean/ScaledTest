import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../auth/KeycloakProvider';
import { UserRole } from '../auth/keycloak';

const Header: React.FC = () => {
  const { isAuthenticated, userProfile, logout, hasRole } = useAuth();
  const router = useRouter();

  return (
    <>
      {/* Skip Navigation Link for keyboard users */}
      <a
        href="#main-content"
        className="skip-link"
        style={{
          position: 'absolute',
          left: '-9999px',
          zIndex: 999,
          padding: '8px 16px',
          background: '#000',
          color: '#fff',
          textDecoration: 'none',
          borderRadius: '0 0 4px 0',
        }}
        onFocus={e => {
          e.target.style.left = '0';
        }}
        onBlur={e => {
          e.target.style.left = '-9999px';
        }}
      >
        Skip to main content
      </a>

      <header className="header" role="banner">
        <div>
          <Link href="/" aria-label="Go to ScaledTest home page">
            <span style={{ fontWeight: 'bold', fontSize: '1.5rem', cursor: 'pointer' }}>
              ScaledTest
            </span>
          </Link>
        </div>

        <nav className="navigation" role="navigation" aria-label="Main navigation">
          {' '}
          <Link
            id="headerHome"
            href="/"
            aria-label="Go to home page"
            aria-current={router.pathname === '/' ? 'page' : undefined}
          >
            Home
          </Link>
          {isAuthenticated ? (
            <>
              {' '}
              <Link
                id="headerDashboard"
                href="/dashboard"
                aria-label="Go to dashboard page"
                aria-current={router.pathname === '/dashboard' ? 'page' : undefined}
              >
                Dashboard
              </Link>{' '}
              <Link
                id="headerProfile"
                href="/profile"
                aria-label="Go to user profile page"
                aria-current={router.pathname === '/profile' ? 'page' : undefined}
              >
                Profile
              </Link>
              {/* Only show admin section for owners */}
              {hasRole(UserRole.OWNER) && (
                <>
                  <Link
                    id="headerManageUsers"
                    href="/admin/users"
                    aria-label="Go to user management page"
                  >
                    Manage Users
                  </Link>
                </>
              )}
              <span id="headerGreeting">
                Hello, {userProfile?.firstName || userProfile?.username || 'User'}
              </span>
              <button id="headerLogOut" onClick={logout} aria-label="Logout from the application">
                Logout
              </button>
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
