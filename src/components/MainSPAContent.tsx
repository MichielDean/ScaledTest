import React from 'react';
import { AppSidebarSPA } from '@/components/app-sidebar-spa';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { useSPANavigation, SPAView } from '../contexts/SPANavigationContext';

// Import all the view components
import DashboardView from './views/DashboardView';
import TestResultsView from './views/TestResultsView';
import AnalyticsView from './views/AnalyticsView';
import ProfileView from './views/ProfileView';
import AdminUsersView from './views/AdminUsersView';
import AdminTeamsView from './views/AdminTeamsView';

interface ViewConfig {
  title: string;
  breadcrumbs: Array<{ label: string; href?: string }>;
  component: React.ComponentType;
}

const viewConfigs: Record<SPAView, ViewConfig> = {
  dashboard: {
    title: 'Dashboard',
    breadcrumbs: [{ label: 'Dashboard' }],
    component: DashboardView,
  },
  'test-results': {
    title: 'Test Results',
    breadcrumbs: [{ label: 'Analytics', href: '#' }, { label: 'Test Results' }],
    component: TestResultsView,
  },
  'modern-analytics': {
    title: 'Modern Analytics',
    breadcrumbs: [{ label: 'Analytics', href: '#' }, { label: 'Modern Analytics' }],
    component: AnalyticsView,
  },
  'visualization-playground': {
    title: 'Visualization Playground',
    breadcrumbs: [{ label: 'Analytics', href: '#' }, { label: 'Visualization Playground' }],
    component: AnalyticsView,
  },
  'simple-test-dashboard': {
    title: 'Simple Dashboard',
    breadcrumbs: [{ label: 'Analytics', href: '#' }, { label: 'Simple Dashboard' }],
    component: AnalyticsView,
  },
  profile: {
    title: 'Profile',
    breadcrumbs: [{ label: 'Profile' }],
    component: ProfileView,
  },
  'admin-users': {
    title: 'Administration - Users',
    breadcrumbs: [{ label: 'Administration', href: '#' }, { label: 'Users' }],
    component: AdminUsersView,
  },
  'admin-teams': {
    title: 'Administration - Teams',
    breadcrumbs: [{ label: 'Administration', href: '#' }, { label: 'Teams' }],
    component: AdminTeamsView,
  },
};

const MainSPAContent: React.FC = () => {
  const { currentView } = useSPANavigation();
  const config = viewConfigs[currentView];
  const CurrentViewComponent = config.component;

  return (
    <div className="relative min-h-screen">
      <SidebarProvider>
        <AppSidebarSPA />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  {config.breadcrumbs.map((crumb, index) => (
                    <React.Fragment key={index}>
                      <BreadcrumbItem className={index === 0 ? 'hidden md:block' : ''}>
                        {crumb.href ? (
                          <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                        ) : (
                          <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                        )}
                      </BreadcrumbItem>
                      {index < config.breadcrumbs.length - 1 && (
                        <BreadcrumbSeparator className="hidden md:block" />
                      )}
                    </React.Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </header>

          <div
            id="main-content"
            className="flex flex-1 flex-col gap-4 p-4 pt-0"
            aria-label={`${config.title} content`}
          >
            <CurrentViewComponent />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
};

export default MainSPAContent;
