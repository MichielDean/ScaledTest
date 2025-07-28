import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../auth/KeycloakProvider';
import Header from '../components/Header';
import axios, { AxiosError } from 'axios';
import { authLogger as logger } from '../logging/logger';
import { RegisterResponse } from '../types/api';
import { Team } from '../types/team';
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
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  // Teams data
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    // If already authenticated, redirect to dashboard
    if (!loading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, loading, router]);

  // Load available teams for registration
  useEffect(() => {
    const loadTeams = async () => {
      try {
        const response = await axios.get<{ success: boolean; teams: Team[] }>('/api/teams');
        if (response.data.success) {
          setAvailableTeams(response.data.teams);
        }
      } catch (error) {
        logger.error('Failed to load teams for registration', { error });
        // Teams are optional, so don't show error to user
      } finally {
        setLoadingTeams(false);
      }
    };

    loadTeams();
  }, []);

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

  // Team selection handlers
  const handleTeamSelection = (teamId: string, checked: boolean) => {
    setSelectedTeamIds(prev => {
      if (checked) {
        return [...prev, teamId];
      } else {
        return prev.filter(id => id !== teamId);
      }
    });
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
        teamIds: selectedTeamIds.length > 0 ? selectedTeamIds : undefined,
      });

      if (response.data.success) {
        // Check if we have tokens for auto-login
        if (response.data.token && response.data.refreshToken) {
          const { storeTokens } = await import('../authentication/keycloakTokenManager');
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
              className={`${sharedAlerts.alert} ${sharedAlerts.alertError}`}
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
              <div className={styles.passwordInputContainer}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Create a password (8+ characters)"
                  required
                  minLength={8}
                  className={styles.passwordInput}
                />
                <button
                  type="button"
                  id="toggle-password-visibility"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  tabIndex={0}
                >
                  <span className={styles.passwordToggleIcon} aria-hidden="true">
                    {showPassword ? (
                      // Eye icon (password visible)
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      // Eye-off icon (password hidden)
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    )}
                  </span>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password*</label>
              <div className={styles.passwordInputContainer}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  required
                  className={styles.passwordInput}
                />
                <button
                  type="button"
                  id="toggle-confirm-password-visibility"
                  className={styles.passwordToggle}
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={
                    showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                  }
                  aria-pressed={showConfirmPassword}
                  tabIndex={0}
                >
                  <span className={styles.passwordToggleIcon} aria-hidden="true">
                    {showConfirmPassword ? (
                      // Eye icon (password visible)
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      // Eye-off icon (password hidden)
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    )}
                  </span>
                </button>
              </div>
            </div>

            {/* Team Selection */}
            {!loadingTeams && availableTeams.length > 0 && (
              <div className="form-group">
                <label>Join Teams (Optional)</label>
                <p className={styles.helpText}>
                  Select which teams you&apos;d like to join. You can join additional teams later.
                </p>
                <div className={styles.teamSelection}>
                  {availableTeams.map(team => (
                    <label key={team.id} className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        id={`team-${team.id}`}
                        checked={selectedTeamIds.includes(team.id)}
                        onChange={e => handleTeamSelection(team.id, e.target.checked)}
                        className={styles.checkbox}
                      />
                      <span className={styles.teamName}>{team.name}</span>
                      {team.description && (
                        <span className={styles.teamDescription}>- {team.description}</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

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
