import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { createApiClient } from "../lib/api";
import type { TestStatistics } from "../types";

const DashboardPage: React.FC = () => {
  const { userProfile, session } = useAuth();
  const navigate = useNavigate();
  const api = createApiClient(() => session?.accessToken || null);

  const [statistics, setStatistics] = useState<TestStatistics | null>(null);

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    try {
      const response = await api.getTestStatistics();
      if (response.data) {
        setStatistics(response.data);
      }
    } catch (err) {
      // Silent fail
    }
  };

  const isAdmin = userProfile?.role === "admin";

  const getStatusColor = (passRate: number) => {
    if (passRate >= 90) return "text-green-600";
    if (passRate >= 70) return "text-amber-700"; // Better contrast than yellow-600
    return "text-red-600";
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 id="dashboard-title" className="text-3xl font-bold text-foreground">
          Dashboard
        </h1>
        <p className="mt-2 text-muted-foreground">
          View your test analytics and overview
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-medium text-muted-foreground">
            Total Test Runs
          </h2>
          <p className="mt-2 text-3xl font-bold text-primary">
            {statistics?.total_runs || 0}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {statistics ? "All time" : "No data yet"}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow">
          <h2 className="text-sm font-medium text-muted-foreground">
            Total Tests
          </h2>
          <p className="mt-2 text-3xl font-bold text-primary">
            {statistics?.total_tests || 0}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {statistics ? "Executed" : "Upload tests"}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow">
          <h2 className="text-sm font-medium text-muted-foreground">
            Pass Rate
          </h2>
          <p
            className={`mt-2 text-3xl font-bold ${statistics ? getStatusColor(statistics.pass_rate) : "text-primary"}`}
          >
            {statistics ? `${statistics.pass_rate.toFixed(1)}%` : "0%"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {statistics ? "Average success rate" : "No metrics yet"}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow">
          <h2 className="text-sm font-medium text-muted-foreground">
            Avg Duration
          </h2>
          <p className="mt-2 text-3xl font-bold text-primary">
            {statistics
              ? statistics.avg_duration_ms < 1000
                ? `${statistics.avg_duration_ms}ms`
                : `${(statistics.avg_duration_ms / 1000).toFixed(1)}s`
              : "0s"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Per test run</p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <Link
          id="view-test-results-card"
          to="/test-results"
          className="rounded-lg border border-border bg-card p-6 hover:shadow-lg transition-shadow"
        >
          <h2 className="text-lg font-semibold text-card-foreground">
            View Test Results
          </h2>
          <p className="mt-2 text-muted-foreground">
            Browse detailed test runs and analyze results
          </p>
          <span className="mt-4 inline-block text-primary hover:underline">
            View results →
          </span>
        </Link>

        <Link
          id="profile-card"
          to="/profile"
          className="rounded-lg border border-border bg-card p-6 hover:shadow-lg transition-shadow"
        >
          <h2 className="text-lg font-semibold text-card-foreground">
            Your Profile
          </h2>
          <p className="mt-2 text-muted-foreground">
            View and update your account information
          </p>
          <span className="mt-4 inline-block text-primary hover:underline">
            Go to profile →
          </span>
        </Link>
      </div>

      {isAdmin && (
        <div
          id="admin-actions-section"
          className="mt-8 rounded-lg border border-primary/20 bg-primary/5 p-6"
        >
          <h2 className="text-lg font-semibold text-foreground">
            Administrative Actions
          </h2>
          <p className="mt-2 text-muted-foreground">
            Manage users and system settings
          </p>
          <div className="mt-4 flex gap-4">
            <button
              id="manage-users-button"
              onClick={() => navigate("/admin/users")}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Manage Users
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
