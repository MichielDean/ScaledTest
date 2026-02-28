import type { NextPage } from 'next';
import withAuth from '../auth/withBetterAuth';
import { Roles } from '../lib/roles';
import { SPANavigationProvider } from '../contexts/SPANavigationContext';
import MainSPAContent from '../components/MainSPAContent';
import DynamicHead from '../components/DynamicHead';

const Dashboard: NextPage = () => {
  return (
    <>
      <SPANavigationProvider>
        <DynamicHead />
        <MainSPAContent />
      </SPANavigationProvider>
    </>
  );
};

export default withAuth(Dashboard, [Roles.READONLY, Roles.MAINTAINER, Roles.OWNER]);
