import { RegisterForm } from '@/components/register-form';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../auth/KeycloakProvider';
import axios, { AxiosError } from 'axios';
import { authLogger as logger } from '../logging/logger';
import { RegisterResponse } from '../types/api';
import { Team } from '../types/team';

interface RegisterFormData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  selectedTeamIds: string[];
}

export default function RegisterPage() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  // Business logic state
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, loading, router]);

  // Load available teams
  useEffect(() => {
    const loadTeams = async () => {
      try {
        const response = await axios.get<{ success: boolean; teams: Team[] }>('/api/teams');
        if (response.data?.success && Array.isArray(response.data.teams)) {
          setAvailableTeams(response.data.teams);
        }
      } catch (err) {
        logger.error('Failed to load teams for registration', { error: err });
        // Continue without teams - they're optional
      } finally {
        setLoadingTeams(false);
      }
    };

    loadTeams();
  }, []);

  const handleRegistration = async (data: RegisterFormData) => {
    setIsLoading(true);
    setError('');

    try {
      const response = await axios.post<RegisterResponse>('/api/auth/register', {
        username: data.email,
        email: data.email,
        password: data.password,
        firstName: data.firstName || undefined,
        lastName: data.lastName || undefined,
        teamIds: data.selectedTeamIds.length > 0 ? data.selectedTeamIds : undefined,
      });

      if (response.data?.success) {
        if (response.data.token && response.data.refreshToken) {
          const { storeTokens } = await import('../authentication/keycloakTokenManager');
          storeTokens(response.data.token, response.data.refreshToken);
          logger.info('User registered and automatically logged in');
          window.location.href = '/dashboard';
        } else {
          logger.info('User registered, redirecting to login');
          router.push('/login');
        }
      } else {
        setError(response.data?.error || 'Registration failed. Please try again.');
      }
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: string }>;
      logger.error('Registration failed', { error: err, email: data.email });

      if (axiosError.response?.status === 409) {
        setError('An account with this email already exists. Please try logging in instead.');
      } else {
        setError(axiosError.response?.data?.error || 'Registration failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Register - ScaledTest</title>
      </Head>

      <main className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm md:max-w-3xl">
          <RegisterForm
            availableTeams={availableTeams}
            loadingTeams={loadingTeams}
            isLoading={isLoading}
            error={error}
            onFormSubmit={handleRegistration}
          />
        </div>
      </main>
    </>
  );
}
