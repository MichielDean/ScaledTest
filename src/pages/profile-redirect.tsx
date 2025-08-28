import type { NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import withAuth from '../auth/withAuth';
import { UserRole } from '../auth/keycloak';

const Profile: NextPage = () => {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the main SPA dashboard with profile view
    router.replace('/dashboard?view=profile');
  }, [router]);

  return null;
};

export default withAuth(Profile, {
  requiredRoles: [UserRole.READONLY, UserRole.MAINTAINER, UserRole.OWNER],
});
