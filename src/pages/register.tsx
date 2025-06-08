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

  // Handle registration form submission
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
        <title>Register - ScaledTest</title>
      </Head>

      <Header />

      <main className="container">
        <div className="form-container">
          <h1 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Create Account</h1>
          <p style={{ marginBottom: '1rem', textAlign: 'center' }}>
            Enter your email address to create an account
          </p>

          {error && (
            <div
              id="registerError"
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

            <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label htmlFor="firstName">First Name</label>
                <input
                  type="text"
                  id="firstName"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="First name"
                />
              </div>

              <div className="form-group" style={{ flex: 1 }}>
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
              style={{ width: '100%', marginTop: '1rem' }}
              disabled={registering}
            >
              {registering ? 'Creating Account...' : 'Create Account'}
            </button>

            <p style={{ textAlign: 'center', margin: '1rem 0' }}>
              Already have an account?{' '}
              <Link href="/login">
                <span id="loginLink" style={{ color: 'var(--primary-color)', cursor: 'pointer' }}>
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
