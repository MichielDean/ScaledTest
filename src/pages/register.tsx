import type { NextPage } from 'next';
import Head from 'next/head';
import { useEffect } from 'react';
import { useAuth } from '../auth/KeycloakProvider';

const Register: NextPage = () => {
  const { keycloak, isAuthenticated, loading } = useAuth();

  useEffect(() => {
    // If already authenticated, redirect to dashboard
    if (!loading && isAuthenticated) {
      window.location.href = '/dashboard';
    }
  }, [isAuthenticated, loading]);

  // Handle registration button click
  const handleRegister = () => {
    if (keycloak) {
      // Redirect to Keycloak registration page
      window.location.href = `${process.env.NEXT_PUBLIC_KEYCLOAK_URL}/realms/${process.env.NEXT_PUBLIC_KEYCLOAK_REALM}/protocol/openid-connect/registrations?client_id=${process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.NEXT_PUBLIC_APP_BASE_URL as string)}&response_type=code`;
    }
  };

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div>
      <Head>
        <title>Register - Keycloak Auth Demo</title>
      </Head>

      <main className="container">
        <div className="form-container">
          <h1 style={{ marginBottom: '2rem', textAlign: 'center' }}>Register</h1>
          <p style={{ marginBottom: '2rem', textAlign: 'center' }}>
            Click the button below to register a new account with Keycloak.
          </p>
          <button onClick={handleRegister} style={{ width: '100%', backgroundColor: '#4CAF50' }}>
            Register with Keycloak
          </button>
        </div>
      </main>
    </div>
  );
};

export default Register;
