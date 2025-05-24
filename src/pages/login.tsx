import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../auth/KeycloakProvider';
import Header from '../components/Header';
import { AxiosError } from 'axios';
import { authLogger as logger } from '../utils/logger';

const Login: NextPage = () => {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Get the returnUrl from the query parameters
  const { returnUrl } = router.query;
  const redirectPath = typeof returnUrl === 'string' ? returnUrl : '/dashboard';

  useEffect(() => {
    // If already authenticated, redirect to dashboard or the return URL
    if (!loading && isAuthenticated) {
      router.push(redirectPath);
    }
  }, [isAuthenticated, loading, redirectPath, router]);

  // Handle login form submission
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoggingIn(true);
    setError(null);

    try {
      // Import here to avoid issues with SSR
      const { directLogin } = await import('../utils/keycloakTokenManager');

      // Perform direct login with username and password
      const success = await directLogin(username, password);

      if (success) {
        // Refresh the page to have KeycloakProvider initialize with the token
        window.location.href = redirectPath;
      } else {
        setError('Authentication failed. Please check your credentials.');
      }
    } catch (err) {
      const axiosError = err as AxiosError;
      logger.error(
        {
          err,
          username, // Include username for context but NOT password
          statusCode: axiosError.response?.status,
          errorCode: axiosError.code,
          url: axiosError.config?.url,
        },
        'Login authentication failed'
      );
      if (axiosError.response && axiosError.response.status === 401) {
        setError('Invalid username or password');
      } else {
        setError('Authentication failed. Please try again later.');
      }
    } finally {
      setLoggingIn(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Header />
        <div className="container">
          <div className="card" style={{ textAlign: 'center' }}>
            <h2>Loading...</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Head>
        <title>Login - ScaledTest</title>
      </Head>

      <Header />

      <main className="container">
        <div className="form-container">
          <h1 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Sign In</h1>

          {error && (
            <div
              id="loginError"
              style={{
                backgroundColor: '#ffebee',
                color: '#c62828',
                padding: '10px',
                borderRadius: '4px',
                marginBottom: '1rem',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>

            <button
              id="signInButton"
              type="submit"
              style={{ width: '100%', marginTop: '1rem' }}
              disabled={loggingIn}
            >
              {loggingIn ? 'Signing in...' : 'Sign In'}
            </button>

            <p style={{ textAlign: 'center', margin: '1rem 0' }}>
              Don&apos;t have an account?{' '}
              <Link href="/register">
                <span
                  id="registerLink"
                  style={{ color: 'var(--primary-color)', cursor: 'pointer' }}
                >
                  Register
                </span>
              </Link>
            </p>
          </form>
        </div>
      </main>
    </div>
  );
};

export default Login;
