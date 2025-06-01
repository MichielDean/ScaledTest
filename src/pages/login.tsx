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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Get the returnUrl from the query parameters
  const { returnUrl } = router.query;
  const sanitizeUrl = (url: string): string => {
    try {
      const parsedUrl = new URL(url, window.location.origin);
      // Allow only relative URLs or URLs matching the current origin
      if (parsedUrl.origin === window.location.origin) {
        return parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
      }
    } catch {
      // If URL parsing fails, fallback to a safe default
      return '/dashboard';
    }
    return '/dashboard';
  };
  const redirectPath = typeof returnUrl === 'string' ? sanitizeUrl(returnUrl) : '/dashboard';

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

      // Perform direct login with email and password
      const success = await directLogin(email, password);

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
          email: email, // Include email for context but NOT password
          statusCode: axiosError.response?.status,
          errorCode: axiosError.code,
          url: axiosError.config?.url,
          errorData: axiosError.response?.data,
        },
        'Login authentication failed'
      );

      // Provide more specific error messages based on the error
      if (axiosError.response?.status === 401) {
        const errorData = axiosError.response.data as {
          error?: string;
          error_description?: string;
        };
        if (errorData?.error === 'invalid_grant') {
          setError('Invalid email or password. Please check your credentials.');
        } else if (errorData?.error_description) {
          setError(`Authentication failed: ${errorData.error_description}`);
        } else {
          setError('Invalid email or password');
        }
      } else if (axiosError.response?.status === 400) {
        const errorData = axiosError.response.data as { error_description?: string };
        if (errorData?.error_description) {
          setError(`Login error: ${errorData.error_description}`);
        } else {
          setError('Bad request. Please check your input.');
        }
      } else if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ERR_NETWORK') {
        setError('Cannot connect to authentication server. Please try again later.');
      } else {
        setError('Authentication failed. Please try again later.');
      }
    } finally {
      setLoggingIn(false);
    }
  };

  // Show login form immediately instead of waiting for auth provider loading
  // This improves time to paint significantly
  if (loading && !isAuthenticated) {
    // Show the login form while still loading for better UX
    // We'll handle the redirect after auth completes
  }

  // If already authenticated and not loading, redirect immediately
  if (!loading && isAuthenticated) {
    router.push(redirectPath);
    return null;
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
                border: '1px solid #c62828',
                display: 'block',
              }}
              data-testid="login-error"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                placeholder="Enter your email"
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
