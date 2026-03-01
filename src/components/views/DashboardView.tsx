import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../types/roles';
import { useSPANavigation } from '../../contexts/SPANavigationContext';
import { BarChart3, CheckCircle, Activity, TrendingUp } from 'lucide-react';
import type { AnalyticsStats } from '../../types/analytics';
import { getPassRateColor } from '../../lib/analyticsFormatting';

const DashboardView: React.FC = () => {
  const { hasRole, token } = useAuth();
  const { navigateTo } = useSPANavigation();
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!token) {
      setStatsLoading(false);
      return;
    }

    setStatsLoading(true);
    try {
      const response = await fetch('/api/analytics', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        // Stats cards are non-critical — silently degrade if unavailable
        return;
      }

      const json = (await response.json()) as {
        success: boolean;
        stats: AnalyticsStats;
      };

      if (json.success) {
        setStats(json.stats);
      }
    } catch {
      // Stats are supplemental — fail silently so the rest of the dashboard works
    } finally {
      setStatsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

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

      {/* Stats Cards */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Quick Stats
        </h2>
        <div className="grid auto-rows-min gap-4 md:grid-cols-3">
          {/* Total Reports */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <>
                  <Skeleton className="h-8 w-16 mb-1" />
                  <Skeleton className="h-3 w-28" />
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.totalReports ?? '—'}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats != null
                      ? `${stats.recentReports} in the last 7 days`
                      : 'Unable to load data'}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Overall Pass Rate */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overall Pass Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <>
                  <Skeleton className="h-8 w-16 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </>
              ) : (
                <>
                  <div
                    className={`text-2xl font-bold ${
                      stats == null ? 'text-muted-foreground' : getPassRateColor(stats.passRate)
                    }`}
                  >
                    {stats != null ? `${stats.passRate}%` : '—'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats != null
                      ? `${stats.totalTests.toLocaleString()} total tests`
                      : 'Unable to load data'}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
              <Activity className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <>
                  <Skeleton className="h-8 w-16 mb-1" />
                  <Skeleton className="h-3 w-32" />
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold text-blue-600">
                    {stats?.recentReports ?? '—'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats != null ? 'reports in the last 7 days' : 'Unable to load data'}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Quick Navigation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Quick Navigation
          </CardTitle>
          <CardDescription>Jump to the section you need</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              id="nav-test-results-button"
              variant="outline"
              onClick={() => navigateTo('test-results')}
            >
              Test Results
            </Button>
            <Button
              id="nav-analytics-button"
              variant="outline"
              onClick={() => navigateTo('modern-analytics')}
            >
              Analytics
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardView;
