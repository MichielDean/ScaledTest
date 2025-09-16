import type { NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import withAuth from '../../auth/withBetterAuth';
import { UserRole } from '../../types/roles';
import { SPANavigationProvider } from '../../contexts/SPANavigationContext';
import MainSPAContent from '../../components/MainSPAContent';
import DynamicHead from '../../components/DynamicHead';

const AdminUsers: NextPage = () => {
  const router = useRouter();

  useEffect(() => {
    // Set the view parameter to show admin-users view
    if (!router.query.view) {
      router.replace('/admin/users?view=admin-users', undefined, { shallow: true });
    }
  }, [router]);

  return (
    <>
      <SPANavigationProvider initialView="admin-users">
        <DynamicHead />
        <MainSPAContent />
      </SPANavigationProvider>
    </>
  );
};

export default withAuth(AdminUsers, [UserRole.ADMIN]);
