import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../auth/KeycloakProvider';
import Header from '../components/Header';
import axios, { AxiosError } from 'axios';
import { authLogger as logger } from '../utils/logger';
import { RegisterResponse } from '../types/api';
import styles from '../styles/Register.module.css';
import sharedAlerts from '../styles/shared/alerts.module.css';
import sharedButtons from '../styles/shared/buttons.module.css';

const Register: NextPage = () => {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    // If already authenticated, redirect to dashboard
    if (!loading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, loading, router]);

  // Form validation
  const validateForm = (): boolean => {
    if (!email.trim()) {
      setError('Email is required');
      return false;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Please enter a valid email address');
      return false;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return false;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Clear previous errors
    setError(null);

    // Validate form
    if (!validateForm()) {
      return;
    }

    setRegistering(true);

    try {
      // Use email as username
      const response = await axios.post<RegisterResponse>('/api/auth/register', {
        username: email,
        email,
        password,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });

      if (response.data.success) {
        // Check if we have tokens for auto-login
        if (response.data.token && response.data.refreshToken) {
          const { storeTokens } = await import('../utils/keycloakTokenManager');
          storeTokens(response.data.token, response.data.refreshToken);

          logger.info('User registered and automatically logged in');

          // Redirect to dashboard with auto-login
          window.location.href = '/dashboard';
        } else {
          // Fallback to login page if no tokens
          logger.info('User registered but no tokens received for auto-login');
          router.push('/login');
        }
      } else {
        setError(response.data.error || 'Registration failed. Please try again.');
      }
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: string }>;

      logger.error(
        {
          err,
          email, // Include email for context but NOT password
          statusCode: axiosError.response?.status,
          errorCode: axiosError.code,
          url: axiosError.config?.url,
        },
        'Registration failed'
      );

      if (axiosError.response?.data?.error) {
        setError(axiosError.response.data.error);
      } else if (axiosError.response?.status === 409) {
        setError('Email already exists');
      } else {
        setError('Registration failed. Please try again later.');
      }
    } finally {
      setRegistering(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Header />
        <div className="container">
          <div className={`card ${styles.centeredCard}`}>
            <h2>Loading...</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Head>
        <title>Register - ScaledTest</title>
      </Head>

      <Header />

      <main id="main-content" className="container">
        <div className="form-container">
          <h1 className={styles.title}>Create Account</h1>
          <p className={styles.subtitle}>Enter your email address to create an account</p>

          {error && (
            <div
              id="registerError"
              role="alert"
              aria-live="polite"
              className={sharedAlerts.errorAlert}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">Email*</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
              />
            </div>

            <div className={styles.formRow}>
              <div className={`form-group ${styles.formGroupFlex}`}>
                <label htmlFor="firstName">First Name</label>
                <input
                  type="text"
                  id="firstName"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="First name"
                />
              </div>

              <div className={`form-group ${styles.formGroupFlex}`}>
                <label htmlFor="lastName">Last Name</label>
                <input
                  type="text"
                  id="lastName"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Last name"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Password*</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Create a password (8+ characters)"
                required
                minLength={8}
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password*</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
              />
            </div>

            <button
              id="registerButton"
              type="submit"
              className={sharedButtons.submitButton}
              disabled={registering}
            >
              {registering ? 'Creating Account...' : 'Create Account'}
            </button>

            <p className={styles.loginText}>
              Already have an account?{' '}
              <Link href="/login" aria-label="Go to login page">
                <span id="loginLink" className={styles.loginLink}>
                  Sign In
                </span>
              </Link>
            </p>
          </form>
        </div>
      </main>
    </div>
  );
};

export default Register;
