import React from 'react';
import Head from 'next/head';
import withAuth from '../auth/withAuth';
import { UserRole } from '../auth/keycloak';
import Header from '../components/Header';
import ModernVisualizationPlayground from '../components/charts/ModernVisualizationPlayground';

const ModernAnalyticsPage: React.FC = () => {
  return (
    <>
      <Head>
        <title>Smart Analytics Studio | ScaledTest</title>
        <meta
          name="description"
          content="Create beautiful, interactive visualizations from your test data with our modern analytics studio"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <Header />

      <main>
        <ModernVisualizationPlayground />
      </main>
    </>
  );
};

export default withAuth(ModernAnalyticsPage, {
  requiredRoles: [UserRole.READONLY, UserRole.MAINTAINER, UserRole.OWNER],
});
