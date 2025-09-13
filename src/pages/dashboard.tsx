import type { NextPage } from 'next';
import withAuth from '../auth/withBetterAuth';
import { Roles } from '../lib/permissions';
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

export default withAuth(Dashboard, [Roles.readonly, Roles.maintainer, Roles.owner]);
