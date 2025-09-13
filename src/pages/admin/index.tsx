import type { NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import withAuth from '../../auth/withBetterAuth';
import { UserRole } from '../../types/roles';

const AdminDashboard: NextPage = () => {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the main SPA dashboard with admin view
    router.replace('/dashboard?view=admin');
  }, [router]);

  return null;
};

export default withAuth(AdminDashboard, [UserRole.MAINTAINER, UserRole.OWNER]);
