import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../lib/roles';
import { useSPANavigation } from '../../contexts/SPANavigationContext';

interface StatsData {
  totalReports: number;
  totalTests: number;
  passRateLast7d: number;
  totalExecutions: number;
  activeExecutions: number;
}

const DashboardView: React.FC = () => {
  const { hasRole, token } = useAuth();
  const { navigateTo } = useSPANavigation();

  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      try {
        setStatsLoading(true);
        setStatsError(null);

        const response = await fetch('/api/v1/stats', {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!response.ok) {
          throw new Error(`Stats fetch failed: ${response.status}`);
        }

        const json = await response.json();

        if (!cancelled) {
          setStats(json.data);
        }
      } catch (err) {
        if (!cancelled) {
          setStatsError(err instanceof Error ? err.message : 'Failed to load stats');
          setStats(null);
        }
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
        }
      }
    };

    fetchStats();

    return () => {
      cancelled = true;
    };
  }, [token]);

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
        {/* Total Reports */}
        <Card>
          <CardHeader>
            <CardTitle>Total Reports</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-3xl font-bold">{(stats?.totalReports ?? 0).toLocaleString()}</p>
            )}
          </CardContent>
        </Card>

        {/* Tests Run */}
        <Card>
          <CardHeader>
            <CardTitle>Tests Run</CardTitle>
            <CardDescription>all time</CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-3xl font-bold">{(stats?.totalTests ?? 0).toLocaleString()}</p>
            )}
          </CardContent>
        </Card>

        {/* Pass Rate */}
        <Card>
          <CardHeader>
            <CardTitle>Pass Rate</CardTitle>
            <CardDescription>last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-3xl font-bold">{stats?.passRateLast7d ?? 0}%</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="bg-muted/50 min-h-[100vh] flex-1 rounded-xl md:min-h-min" />
    </div>
  );
};

export default DashboardView;
