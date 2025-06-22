import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../auth/KeycloakProvider';
import Header from '../components/Header';
import { AxiosError } from 'axios';
import { authLogger as logger } from '../utils/logger';
import styles from '../styles/Login.module.css';
import sharedAlerts from '../styles/shared/alerts.module.css';
import sharedButtons from '../styles/shared/buttons.module.css';

const Login: NextPage = () => {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

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

      <main id="main-content" className="container">
        <div className="form-container">
          <h1 className={styles.title}>Sign In</h1>

          {error && (
            <div
              id="loginError"
              role="alert"
              aria-live="polite"
              className={`${sharedAlerts.alert} ${sharedAlerts.alertError}`}
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
                name="username"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                aria-required="true"
                aria-describedby={error ? 'loginError' : undefined}
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                aria-required="true"
                aria-describedby={error ? 'loginError' : undefined}
                autoComplete="current-password"
              />
            </div>

            <button
              id="signInButton"
              type="submit"
              className={sharedButtons.submitButton}
              disabled={loggingIn}
            >
              {loggingIn ? 'Signing in...' : 'Sign In'}
            </button>

            <p className={styles.registerText}>
              Don&apos;t have an account?{' '}
              <Link href="/register" aria-label="Go to registration page">
                <span id="registerLink" className={styles.registerLink}>
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
