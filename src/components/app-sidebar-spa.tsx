import * as React from 'react';
import { BarChart3, Building2, FileText, Home, Settings, TestTube } from 'lucide-react';

import { NavMain } from '@/components/nav-main-spa';
import { NavProjects } from '@/components/nav-projects';
import { NavUser } from '@/components/nav-user';
import { TeamSwitcher } from '@/components/team-switcher';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useAuth } from '../auth/KeycloakProvider';
import { hasWriteAccess } from '../auth/keycloak';
import { useSPANavigation } from '../contexts/SPANavigationContext';

export function AppSidebarSPA({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { userProfile, logout } = useAuth();
  const { navigateTo, currentView } = useSPANavigation();

  // SPA navigation structure with click handlers instead of URLs
  const navMain = [
    {
      title: 'Dashboard',
      onClick: () => navigateTo('dashboard'),
      icon: Home,
      isActive: currentView === 'dashboard',
      id: 'headerDashboard',
    },
    {
      title: 'Analytics',
      icon: BarChart3,
      isActive: [
        'test-results',
        'modern-analytics',
        'visualization-playground',
        'simple-test-dashboard',
      ].includes(currentView),
      items: [
        {
          title: 'Test Results',
          onClick: () => navigateTo('test-results'),
          isActive: currentView === 'test-results',
        },
        {
          title: 'Modern Analytics',
          onClick: () => navigateTo('modern-analytics'),
          isActive: currentView === 'modern-analytics',
        },
        {
          title: 'Visualization Playground',
          onClick: () => navigateTo('visualization-playground'),
          isActive: currentView === 'visualization-playground',
        },
        {
          title: 'Simple Dashboard',
          onClick: () => navigateTo('simple-test-dashboard'),
          isActive: currentView === 'simple-test-dashboard',
        },
      ],
    },
    ...(hasWriteAccess()
      ? [
          {
            title: 'Administration',
            icon: Settings,
            isActive: ['admin-users', 'admin-teams'].includes(currentView),
            items: [
              {
                title: 'Users',
                onClick: () => navigateTo('admin-users'),
                id: 'headerAdminUsers',
                isActive: currentView === 'admin-users',
              },
              {
                title: 'Teams',
                onClick: () => navigateTo('admin-teams'),
                id: 'headerAdminTeams',
                isActive: currentView === 'admin-teams',
              },
            ],
          },
        ]
      : []),
  ];

  // User teams as projects
  const teams = [
    {
      name: 'Development',
      url: '#', // Placeholder URL to satisfy the interface
      icon: Building2,
    },
    {
      name: 'QA Testing',
      url: '#', // Placeholder URL to satisfy the interface
      icon: TestTube,
    },
    {
      name: 'Reports',
      url: '#', // Placeholder URL to satisfy the interface
      icon: FileText,
    },
  ];

  const user = {
    name:
      userProfile?.firstName && userProfile?.lastName
        ? `${userProfile.firstName} ${userProfile.lastName}`
        : userProfile?.username || 'User',
    email: userProfile?.email || '',
    avatar: '/icon.png',
  };

  return (
    <aside aria-label="Main navigation sidebar">
      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader>
          <TeamSwitcher teams={[]} />
        </SidebarHeader>
        <SidebarContent>
          <NavMain items={navMain} />
          <NavProjects projects={teams} />
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={user} onLogout={logout} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
    </aside>
  );
}
