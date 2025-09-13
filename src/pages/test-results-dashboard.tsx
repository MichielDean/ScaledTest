import type { NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import withAuth from '../auth/withBetterAuth';
import { UserRole } from '../types/roles';

const TestResultsDashboard: NextPage = () => {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the main SPA dashboard with test-results view
    router.replace('/dashboard?view=test-results');
  }, [router]);

  return null;
};

export default withAuth(TestResultsDashboard, [
  UserRole.READONLY,
  UserRole.MAINTAINER,
  UserRole.OWNER,
]);
