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
            Keycloak Demo
          </span>
        </Link>
      </div>
      
      <nav className="navigation">
        <Link href="/">Home</Link>
        
        {isAuthenticated ? (
          <>
            <Link href="/dashboard">Dashboard</Link>
            
            {/* Only show admin section for owners */}
            {hasRole(UserRole.OWNER) && (
              <Link href="/admin">Admin</Link>
            )}
            
            <span>Hello, {userProfile?.firstName || userProfile?.username || 'User'}</span>
            
            <button onClick={logout}>Logout</button>
          </>
        ) : (
          <>
            <Link href="/login">Login</Link>
            <Link href="/register">Register</Link>
          </>
        )}
      </nav>
    </header>
  );
};

export default Header;