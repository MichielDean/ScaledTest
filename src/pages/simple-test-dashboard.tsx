import type { NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import withAuth from '../auth/withBetterAuth';
import { UserRole } from '../types/roles';

const SimpleTestDashboard: NextPage = () => {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the main SPA dashboard with simple-test-dashboard view
    router.replace('/dashboard?view=simple-test-dashboard');
  }, [router]);

  return null;
};

export default withAuth(SimpleTestDashboard, [
  UserRole.READONLY,
  UserRole.MAINTAINER,
  UserRole.OWNER,
]);
