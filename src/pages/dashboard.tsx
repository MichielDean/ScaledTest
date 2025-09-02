import type { NextPage } from 'next';
import Head from 'next/head';
import withAuth from '../auth/withBetterAuth';
import { Roles } from '../lib/permissions';
import { SPANavigationProvider } from '../contexts/SPANavigationContext';
import MainSPAContent from '../components/MainSPAContent';

const Dashboard: NextPage = () => {
  return (
    <>
      <Head>
        <title>ScaledTest - Dashboard</title>
        <meta name="description" content="ScaledTest Dashboard with seamless navigation" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <SPANavigationProvider>
        <MainSPAContent />
      </SPANavigationProvider>
    </>
  );
};

export default withAuth(Dashboard, [Roles.readonly, Roles.maintainer, Roles.owner]);
