import type { NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import withAuth from '../auth/withAuth';
import { UserRole } from '../auth/keycloak';

const TestResultsDashboard: NextPage = () => {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the main SPA dashboard with test-results view
    router.replace('/dashboard?view=test-results');
  }, [router]);

  return null;
};

export default withAuth(TestResultsDashboard, {
  requiredRoles: [UserRole.READONLY, UserRole.MAINTAINER, UserRole.OWNER],
});
