import React from 'react';
import Head from 'next/head';
import { useAuth } from '../auth/KeycloakProvider';
import Header from '../components/Header';
import VisualizationPlayground from '../components/charts/VisualizationPlayground';
import withAuth from '../auth/withAuth';
import { UserRole } from '../config/keycloak';
import styles from '../styles/Dashboard.module.css';

const VisualizationPlaygroundPage: React.FC = () => {
  const { token } = useAuth();

  return (
    <div>
      <Head>
        <title>Visualization Playground - ScaledTest</title>
        <meta
          name="description"
          content="Create custom visualizations from your CTRF test data using OpenSearch"
        />
      </Head>

      <Header />

      <main id="main-content" className={styles.main}>
        <h1 id="playground-title" className={styles.title}>
          Visualization Playground
        </h1>

        <div className={styles.description}>
          <p>
            Create custom visualizations and dashboards from your CTRF test data. Use the query
            builder to explore your data, save custom visualizations, or access the full OpenSearch
            Dashboards environment for advanced analytics.
          </p>
        </div>

        <VisualizationPlayground token={token} />
      </main>
    </div>
  );
};

export default withAuth(VisualizationPlaygroundPage, {
  requiredRoles: [UserRole.READONLY, UserRole.MAINTAINER, UserRole.OWNER],
});
