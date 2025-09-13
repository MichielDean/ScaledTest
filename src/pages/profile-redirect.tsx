import type { NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import withAuth from '../auth/withBetterAuth';
import { UserRole } from '../types/roles';

const Profile: NextPage = () => {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the main SPA dashboard with profile view
    router.replace('/dashboard?view=profile');
  }, [router]);

  return null;
};

export default withAuth(Profile, [UserRole.READONLY, UserRole.MAINTAINER, UserRole.OWNER]);
