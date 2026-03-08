import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '../../hooks/useAuth';
import { useTeams } from '../../contexts/TeamContext';
import { UserRole } from '../../lib/roles';
import { useSPANavigation } from '../../contexts/SPANavigationContext';

interface StatsData {
  totalReports: number;
  totalTests: number;
  passRateLast7d: number;
  totalExecutions: number;
  activeExecutions: number;
}

// ── Team context label ──────────────────────────────────────────────────────

/**
 * Derive a human-readable label for the current team selection.
 *
 * - One team selected → show its name
 * - No teams selected (but teams exist) → "All teams"
 * - No teams at all → empty string (caller hides the label)
 */
function teamLabel(
  userTeams: Array<{ id: string; name: string }>,
  selectedTeamIds: string[]
): string {
  if (userTeams.length === 0) return '';
  if (selectedTeamIds.length === 0) return 'All teams';
  if (selectedTeamIds.length === 1) {
    const team = userTeams.find(t => t.id === selectedTeamIds[0]);
    return team?.name ?? 'All teams';
  }
  return `${selectedTeamIds.length} teams`;
}

// ── DashboardView ───────────────────────────────────────────────────────────

const DashboardView: React.FC = () => {
  const { hasRole, token } = useAuth();
  const { navigateTo } = useSPANavigation();
  const { userTeams, selectedTeamIds, hasMultipleTeams, setSelectedTeamIds } = useTeams();

  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

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

  const currentTeamLabel = teamLabel(userTeams, selectedTeamIds);

  return (
    <div className="space-y-6">
      {/* Header row: title + team context */}
      <div className="flex items-center justify-between">
        <h1 id="dashboard-title" className="text-2xl font-bold">
          Dashboard Overview
        </h1>

        {/* Team context indicator + switcher (only when user has teams) */}
        {userTeams.length > 0 && (
          <div className="flex items-center gap-2">
            {hasMultipleTeams ? (
              // Multi-team: show a dropdown switcher
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    id="team-switcher-button"
                    data-testid="team-switcher"
                    className="flex items-center gap-1"
                  >
                    {currentTeamLabel}
                    <ChevronDown className="ml-1 h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  <DropdownMenuLabel>Switch team</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {userTeams.map(team => (
                    <DropdownMenuItem
                      key={team.id}
                      onClick={() => setSelectedTeamIds([team.id])}
                      className={selectedTeamIds.includes(team.id) ? 'font-semibold' : ''}
                    >
                      {team.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem id="all-teams-option" onClick={() => setSelectedTeamIds([])}>
                    All teams
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              // Single team: static label, no dropdown needed
              <span className="text-muted-foreground text-sm">{currentTeamLabel}</span>
            )}
          </div>
        )}
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

      {statsError && (
        <p className="text-sm text-destructive" role="alert">
          {statsError}
        </p>
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
