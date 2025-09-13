import type { NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import withAuth from '../../auth/withBetterAuth';
import { UserRole } from '../../types/roles';
import { SPANavigationProvider } from '../../contexts/SPANavigationContext';
import MainSPAContent from '../../components/MainSPAContent';
import DynamicHead from '../../components/DynamicHead';

const AdminTeams: NextPage = () => {
  const router = useRouter();

  useEffect(() => {
    // Set the view parameter to show admin-teams view
    if (!router.query.view) {
      router.replace('/admin/teams?view=admin-teams', undefined, { shallow: true });
    }
  }, [router]);

  return (
    <>
      <SPANavigationProvider initialView="admin-teams">
        <DynamicHead />
        <MainSPAContent />
      </SPANavigationProvider>
    </>
  );
};

export default withAuth(AdminTeams, [UserRole.MAINTAINER, UserRole.OWNER]);
