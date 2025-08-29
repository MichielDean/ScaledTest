import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '../../auth/KeycloakProvider';
import { UserRole } from '../../auth/keycloak';
import { useSPANavigation } from '../../contexts/SPANavigationContext';

const DashboardView: React.FC = () => {
  const { hasRole } = useAuth();
  const { navigateTo } = useSPANavigation();

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <h1 id="dashboard-title" className="text-2xl font-bold">
          Dashboard Overview
        </h1>
      </div>

      {/* Admin Actions Section - Only for Owners */}
      {hasRole(UserRole.OWNER) && (
        <Card id="admin-actions-section">
          <CardHeader>
            <CardTitle>Admin Actions</CardTitle>
            <CardDescription>Administrative tools and settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button id="manage-users-button" onClick={() => navigateTo('admin-users')}>
                Manage Users
              </Button>
              <Button
                id="manage-teams-button"
                variant="outline"
                onClick={() => navigateTo('admin-teams')}
              >
                Manage Teams
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid auto-rows-min gap-4 md:grid-cols-3">
        <div className="bg-muted/50 aspect-video rounded-xl" />
        <div className="bg-muted/50 aspect-video rounded-xl" />
        <div className="bg-muted/50 aspect-video rounded-xl" />
      </div>
      <div className="bg-muted/50 min-h-[100vh] flex-1 rounded-xl md:min-h-min" />
    </div>
  );
};

export default DashboardView;
