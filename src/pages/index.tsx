import type { NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../auth/KeycloakProvider';

// Fast redirect to login page without showing "Redirecting..." UI
const Home: NextPage = () => {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Fast redirect logic - don't wait for loading to complete
    if (isAuthenticated) {
      router.replace('/dashboard');
    } else if (!loading) {
      // Only redirect to login when we're sure we're not authenticated
      router.replace('/login');
    } else {
      // If still loading, do an immediate redirect to login anyway
      // The login page will handle auth state properly
      const timer = setTimeout(() => {
        router.replace('/login');
      }, 100); // Very short delay to avoid flash

      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, loading, router]);

  // Return null to prevent any content flash
  return null;
};

export default Home;
