import React from 'react';
import Head from 'next/head';
import { useSPANavigation, SPAView } from '../contexts/SPANavigationContext';

interface ViewConfig {
  title: string;
  description?: string;
}

const viewConfigs: Record<SPAView, ViewConfig> = {
  dashboard: {
    title: 'ScaledTest - Dashboard',
    description: 'ScaledTest Dashboard with seamless navigation',
  },
  'test-results': {
    title: 'ScaledTest - Test Results',
    description: 'View and analyze test results',
  },
  'modern-analytics': {
    title: 'ScaledTest - Modern Analytics',
    description: 'Advanced analytics and data visualization',
  },
  'visualization-playground': {
    title: 'ScaledTest - Visualization Playground',
    description: 'Interactive data visualization tools',
  },
  'simple-test-dashboard': {
    title: 'ScaledTest - Simple Dashboard',
    description: 'Simple dashboard view',
  },
  profile: {
    title: 'ScaledTest - Profile',
    description: 'User profile settings and information',
  },
  'admin-users': {
    title: 'ScaledTest - Administration - Users',
    description: 'User management and administration',
  },
  'admin-teams': {
    title: 'ScaledTest - Administration - Teams',
    description: 'Team management and administration',
  },
};

const DynamicHead: React.FC = () => {
  const { currentView } = useSPANavigation();
  const config = viewConfigs[currentView];

  return (
    <Head>
      <title>{config.title}</title>
      <meta name="description" content={config.description || 'ScaledTest application'} />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </Head>
  );
};

export default DynamicHead;
