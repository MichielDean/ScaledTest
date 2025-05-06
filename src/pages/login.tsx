import type { NextPage } from 'next';
import Head from 'next/head';
import { useEffect } from 'react';
import { useAuth } from '../auth/KeycloakProvider';

const Login: NextPage = () => {
  const { login, isAuthenticated, loading } = useAuth();

  useEffect(() => {
    // If already authenticated, redirect to dashboard
    if (!loading && isAuthenticated) {
      window.location.href = '/dashboard';
    }
  }, [isAuthenticated, loading]);

  // Handle login button click
  const handleLogin = () => {
    login();
  };

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div>
      <Head>
        <title>Login - Keycloak Auth Demo</title>
      </Head>

      <main className="container">
        <div className="form-container">
          <h1 style={{ marginBottom: '2rem', textAlign: 'center' }}>Login</h1>
          <p style={{ marginBottom: '2rem', textAlign: 'center' }}>
            Click the button below to log in with Keycloak.
          </p>
          <button 
            onClick={handleLogin}
            style={{ width: '100%' }}
          >
            Login with Keycloak
          </button>
        </div>
      </main>
    </div>
  );
};

export default Login;