import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-keys';
import { useAuthStore } from '../stores/auth-store';

const AUDIT_PAGE_SIZE = 20;

interface AuditLogEntry {
  id: string;
  actor_id: string;
  actor_email: string;
  team_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
}

interface User {
  id: string;
  email: string;
  display_name: string;
  role: string;
  created_at: string;
}

interface Team {
  id: string;
  name: string;
  created_at: string;
}

export function AdminPage() {
  const user = useAuthStore(s => s.user);

  if (user?.role !== 'owner') {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground mt-2">
          You need owner permissions to access this page.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold">Admin</h1>
      <UsersSection />
      <TeamsSection />
      <AuditLogSection />
    </div>
  );
}

function UsersSection() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.users(),
    queryFn: () => api.adminListUsers() as Promise<{ users: User[] }>,
  });

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Users</h2>
      {isLoading ? (
        <p className="text-muted-foreground">Loading users...</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-left p-3 font-medium">Display Name</th>
                <th className="text-left p-3 font-medium">Role</th>
                <th className="text-left p-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {(data?.users ?? []).map(u => (
                <tr key={u.id} className="border-t">
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">{u.display_name}</td>
                  <td className="p-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        u.role === 'owner'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                          : u.role === 'maintainer'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {(data?.users ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="p-3 text-center text-muted-foreground">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AuditLogSection() {
  const [offset, setOffset] = useState(0);
  const [actionFilter, setActionFilter] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.admin.auditLog(AUDIT_PAGE_SIZE, offset, actionFilter),
    queryFn: () =>
      api.adminListAuditLog(AUDIT_PAGE_SIZE, offset, actionFilter) as Promise<{
        audit_log: AuditLogEntry[];
        total: number;
      }>,
  });

  const entries = data?.audit_log ?? [];
  const total = data?.total ?? 0;
  const hasPrev = offset > 0;
  const hasNext = offset + AUDIT_PAGE_SIZE < total;

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Audit Log</h2>
      <div className="flex items-center gap-2 mb-4">
        <label htmlFor="audit-action-filter" className="text-sm font-medium">
          Filter by action
        </label>
        <select
          id="audit-action-filter"
          value={actionFilter}
          onChange={e => {
            setActionFilter(e.target.value);
            setOffset(0);
          }}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All actions</option>
          <option value="report.submitted">report.submitted</option>
          <option value="report.deleted">report.deleted</option>
          <option value="execution.created">execution.created</option>
          <option value="execution.cancelled">execution.cancelled</option>
          <option value="execution.completed">execution.completed</option>
          <option value="execution.failed">execution.failed</option>
        </select>
      </div>
      {isLoading ? (
        <p className="text-muted-foreground">Loading audit log...</p>
      ) : isError ? (
        <p className="text-destructive">Failed to load audit log.</p>
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Actor</th>
                  <th className="text-left p-3 font-medium">Action</th>
                  <th className="text-left p-3 font-medium">Resource Type</th>
                  <th className="text-left p-3 font-medium">Resource ID</th>
                  <th className="text-left p-3 font-medium">Team</th>
                  <th className="text-left p-3 font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-t">
                    <td className="p-3">{e.actor_email}</td>
                    <td className="p-3 font-mono text-xs">{e.action}</td>
                    <td className="p-3 text-muted-foreground">{e.resource_type ?? '—'}</td>
                    <td className="p-3 text-muted-foreground font-mono text-xs">
                      {e.resource_id ?? '—'}
                    </td>
                    <td className="p-3 text-muted-foreground font-mono text-xs">
                      {e.team_id ?? '—'}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-3 text-center text-muted-foreground">
                      No audit log entries found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-sm text-muted-foreground">
              {total === 0
                ? 'No entries'
                : `Showing ${offset + 1}–${Math.min(offset + AUDIT_PAGE_SIZE, total)} of ${total}`}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(o => Math.max(0, o - AUDIT_PAGE_SIZE))}
                disabled={!hasPrev}
                className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setOffset(o => o + AUDIT_PAGE_SIZE)}
                disabled={!hasNext}
                className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function TeamsSection() {
  const [newTeamName, setNewTeamName] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.teams.list(),
    queryFn: () => api.getTeams() as Promise<{ teams: Team[] }>,
  });

  const createTeam = useMutation({
    mutationFn: (name: string) => api.createTeam(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.list() });
      setNewTeamName('');
    },
  });

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTeamName.trim()) {
      createTeam.mutate(newTeamName.trim());
    }
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Teams</h2>
      <form onSubmit={handleCreateTeam} className="flex gap-2 mb-4">
        <input
          type="text"
          value={newTeamName}
          onChange={e => setNewTeamName(e.target.value)}
          placeholder="New team name"
          className="rounded-md border bg-background px-3 py-2 text-sm"
          required
        />
        <button
          type="submit"
          disabled={createTeam.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {createTeam.isPending ? 'Creating...' : 'Create Team'}
        </button>
      </form>
      {isLoading ? (
        <p className="text-muted-foreground">Loading teams...</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {(data?.teams ?? []).map(t => (
                <tr key={t.id} className="border-t">
                  <td className="p-3 font-medium">{t.name}</td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {(data?.teams ?? []).length === 0 && (
                <tr>
                  <td colSpan={2} className="p-3 text-center text-muted-foreground">
                    No teams found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
