import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { createApiClient } from "../lib/api";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at?: string;
}

interface UsersResponse {
  users: User[];
  total: number;
}

const AdminUsersPage: React.FC = () => {
  const { user, userProfile, session } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(() => session?.accessToken ?? null, [session?.accessToken]);

  useEffect(() => {
    // Check if user is admin
    if (user && userProfile?.role !== "admin") {
      navigate("/unauthorized");
      return;
    }

    // Load users from API
    loadUsers();
  }, [user, userProfile, navigate, getToken]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);

      const apiClient = createApiClient(getToken);
      const result = await apiClient.get<UsersResponse>("/api/v1/users");

      if (result.error) {
        throw new Error(result.error);
      }

      setUsers(result.data?.users || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load users";
      setError(message);
      toast.error("Error", { description: message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("Are you sure you want to delete this user?")) {
      return;
    }

    try {
      const apiClient = createApiClient(getToken);
      const result = await apiClient.delete(`/api/v1/users/${userId}`);

      if (result.error) {
        throw new Error(result.error);
      }

      setUsers(users.filter((u) => u.id !== userId));
      toast.success("User Deleted", { description: "User has been deleted successfully" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete user";
      setError(message);
      toast.error("Error", { description: message });
      setTimeout(() => setError(null), 3000);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 id="page-title" className="text-3xl font-bold text-foreground">
          User Management
        </h1>
        <p className="mt-2 text-muted-foreground">
          Manage user accounts and permissions
        </p>
      </div>

      {error && (
        <div
          id="error-message"
          className="mb-4 rounded-lg bg-destructive/10 p-4 text-destructive"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">Loading users...</div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <h2 id="admin-users-title" className="sr-only">
            Users List
          </h2>
          <table id="users-table" className="w-full">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">
                  Role
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-muted-foreground"
                  >
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    id={`user-row-${user.id}`}
                    className="border-b border-border hover:bg-muted/50"
                  >
                    <td className="px-6 py-4 text-sm text-foreground">
                      {user.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          user.role === "admin"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminUsersPage;
