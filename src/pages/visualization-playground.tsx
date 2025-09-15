import type { NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import withAuth from '../auth/withBetterAuth';
import { UserRole } from '../types/roles';

const VisualizationPlayground: NextPage = () => {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the main SPA dashboard with visualization-playground view
    router.replace('/dashboard?view=visualization-playground');
  }, [router]);

  return null;
};

export default withAuth(VisualizationPlayground, [UserRole.USER, UserRole.ADMIN]);
