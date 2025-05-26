import React from 'react';
import Link from 'next/link';
import { useAuth } from '../auth/KeycloakProvider';
import { UserRole } from '../auth/keycloak';

const Header: React.FC = () => {
  const { isAuthenticated, userProfile, logout, hasRole } = useAuth();

  return (
    <header className="header">
      <div>
        <Link href="/">
          <span style={{ fontWeight: 'bold', fontSize: '1.5rem', cursor: 'pointer' }}>
            ScaledTest
          </span>
        </Link>
      </div>

      <nav className="navigation">
        <Link id="headerHome" href="/">
          Home
        </Link>

        {isAuthenticated ? (
          <>
            <Link id="headerDashboard" href="/dashboard">
              Dashboard
            </Link>

            <Link id="headerTestResults" href="/test-results-dashboard">
              Test Results
            </Link>

            {/* Only show admin section for owners */}
            {hasRole(UserRole.OWNER) && (
              <>
                <Link id="headerManageUsers" href="/admin/users">
                  Manage Users
                </Link>
              </>
            )}

            <span id="headerGreeting">
              Hello, {userProfile?.firstName || userProfile?.username || 'User'}
            </span>

            <button id="headerLogOut" onClick={logout}>
              Logout
            </button>
          </>
        ) : (
          <>
            <Link id="headerLogin" href="/login">
              Login
            </Link>
            <Link id="headerRegister" href="/register">
              Register
            </Link>
          </>
        )}
      </nav>
    </header>
  );
};

export default Header;
