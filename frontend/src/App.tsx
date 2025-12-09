import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ConfigProvider } from "./contexts/ConfigContext";
import { ApiProvider } from "./contexts/ApiContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "./components/ui/sonner";
import { AppLayout } from "./components/AppLayout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import ProfilePage from "./pages/ProfilePage";
import TestResultsPage from "./pages/TestResultsPage";
import UnauthorizedPage from "./pages/UnauthorizedPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectSetupWizardPage from "./pages/ProjectSetupWizardPage";
import ProjectManagementPage from "./pages/ProjectManagementPage";
import { useAuth } from "./contexts/AuthContext";
import "./styles/globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, userProfile, loading } = useAuth();

  // Wait for initial loading to complete
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // Redirect if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Wait for userProfile (including role) to be loaded
  // This ensures components have access to role data when they mount
  if (!userProfile || userProfile.role === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading profile...</div>
      </div>
    );
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppLayout>
              <DashboardPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ProfilePage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/test-results"
        element={
          <ProtectedRoute>
            <AppLayout>
              <TestResultsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/test-results-dashboard"
        element={
          <ProtectedRoute>
            <AppLayout>
              <TestResultsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute>
            <AppLayout>
              <AdminUsersPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      {/* Project routes */}
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ProjectsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/new"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ProjectSetupWizardPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:projectId"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ProjectManagementPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ApiProvider>
            <ConfigProvider>
              <AppRoutes />
              <Toaster position="top-right" richColors closeButton />
            </ConfigProvider>
          </ApiProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
