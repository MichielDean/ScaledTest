import type { NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../auth/KeycloakProvider';

// Make the login page the default route by redirecting
const Home: NextPage = () => {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (isAuthenticated) {
        // If already authenticated, go to dashboard
        router.push('/dashboard');
      } else {
        // If not authenticated, redirect to login
        router.push('/login');
      }
    }
  }, [isAuthenticated, loading, router]);

  // This is just a loading screen shown briefly during the redirect
  return (
    <div className="container">
      <div className="card" style={{ textAlign: 'center' }}>
        <h2>Redirecting...</h2>
      </div>
    </div>
  );
};

export default Home;
