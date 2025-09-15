import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../types/roles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Shield, Mail, UserCheck } from 'lucide-react';

const ProfileView: React.FC = () => {
  const { user: userProfile, hasRole } = useAuth();

  const userRoles = [
    {
      role: UserRole.USER,
      label: 'User',
      check: hasRole(UserRole.USER),
      id: 'role-user',
    },
    {
      role: UserRole.ADMIN,
      label: 'Admin',
      check: hasRole(UserRole.ADMIN),
      id: 'role-admin',
    },
  ].filter(role => role.check);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="space-y-2">
        <h1
          id="profile-title"
          className="text-3xl font-bold tracking-tight flex items-center gap-2"
        >
          <User className="h-8 w-8 text-primary" />
          User Profile
        </h1>
        <p className="text-muted-foreground">View your account information and role assignments</p>
      </header>

      {/* Profile Information */}
      <Card id="user-profile-section">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Profile Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Name</span>
              </div>
              <p className="text-sm text-muted-foreground pl-6">{userProfile?.name || 'N/A'}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Email</span>
              </div>
              <p className="text-sm text-muted-foreground pl-6">{userProfile?.email || 'N/A'}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Roles</span>
              </div>
              <div className="pl-6">
                {userRoles.length > 0 ? (
                  <ul id="user-roles-list" className="flex flex-wrap gap-2">
                    {userRoles.map(({ label, id }) => (
                      <li key={id}>
                        <Badge id={id} variant="secondary" className="flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          {label}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No roles assigned</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfileView;
