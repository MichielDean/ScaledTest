import { createRootRoute, createRoute, redirect } from '@tanstack/react-router';
import { RootLayout } from '../components/layout/root-layout';
import { DashboardPage } from './dashboard';
import { LoginPage } from './login';
import { RegisterPage } from './register';
import { OAuthCallbackPage } from './oauth-callback';
import { ExecutionsPage } from './executions';
import { QualityGatesPage } from './quality-gates';
import { WebhooksPage } from './webhooks';
import { ShardingPage } from './sharding';
import { AdminPage } from './admin';
import { ReportsComparePage } from './reports-compare';
import { AnalyticsPage } from './analytics';
import { TestResultsPage } from './test-results';
import { AcceptInvitationPage } from './accept-invitation';
import { useAuthStore } from '../stores/auth-store';

function requireAuth() {
  if (!useAuthStore.getState().isAuthenticated) {
    throw redirect({ to: '/login' });
  }
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: requireAuth,
  component: DashboardPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: RegisterPage,
});

const oauthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: OAuthCallbackPage,
});

const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reports',
  beforeLoad: requireAuth,
  component: TestResultsPage,
});

const reportsCompareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reports/compare',
  beforeLoad: requireAuth,
  component: ReportsComparePage,
});

const executionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/executions',
  beforeLoad: requireAuth,
  component: ExecutionsPage,
});

const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/analytics',
  beforeLoad: requireAuth,
  component: AnalyticsPage,
});

const qualityGatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/quality-gates',
  beforeLoad: requireAuth,
  component: QualityGatesPage,
});

const webhooksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/webhooks',
  beforeLoad: requireAuth,
  component: WebhooksPage,
});

const shardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sharding',
  beforeLoad: requireAuth,
  component: ShardingPage,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  beforeLoad: requireAuth,
  component: AdminPage,
});

const invitationAcceptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invitations/$token',
  component: AcceptInvitationPage,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  oauthCallbackRoute,
  reportsRoute,
  reportsCompareRoute,
  executionsRoute,
  analyticsRoute,
  qualityGatesRoute,
  webhooksRoute,
  shardingRoute,
  adminRoute,
  invitationAcceptRoute,
]);
