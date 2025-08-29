import type { NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import withAuth from '../auth/withAuth';
import { UserRole } from '../auth/keycloak';

const ModernAnalytics: NextPage = () => {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the main SPA dashboard with modern-analytics view
    router.replace('/dashboard?view=modern-analytics');
  }, [router]);

  return null;
};

export default withAuth(ModernAnalytics, {
  requiredRoles: [UserRole.READONLY, UserRole.MAINTAINER, UserRole.OWNER],
});
