import { RegisterForm } from '@/components/register-form';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';
import { authLogger as logger } from '../logging/logger';
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
        // Temporarily disable teams loading - teams API not implemented
        // const response = await fetch('/api/teams');
        // if (response.ok) {
        //   const data = await response.json();
        //   if (data?.success && Array.isArray(data.teams)) {
        //     setAvailableTeams(data.teams);
        //   }
        // }

        // For now, just set empty teams list
        setAvailableTeams([]);
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
      // Use Better Auth for registration
      const { signUp } = await import('../lib/auth-client');

      const response = await signUp.email({
        email: data.email,
        password: data.password,
        name: data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : data.email,
      });

      if (response.data?.user) {
        logger.info('User registered successfully with Better Auth');
        // Better Auth handles authentication automatically after registration
        window.location.href = '/dashboard';
      } else if (response.error) {
        logger.error('Registration failed', { error: response.error });
        setError(response.error.message || 'Registration failed');
      }
    } catch (err) {
      logger.error('Registration failed', { error: err, email: data.email });
      setError('Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Register</title>
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
