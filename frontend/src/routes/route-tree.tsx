import { ProfilePage } from './profile';
import { createRootRoute, createRoute, redirect } from '@tanstack/react-router';
import { RootLayout } from '../components/layout/root-layout';
import { AuthLayout } from '../components/layout/auth-layout';
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

const rootRoute = createRootRoute();

// Pathless layout route: authenticated app shell with sidebar
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: RootLayout,
});

// Pathless layout route: unauthenticated pages (no sidebar)
const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth',
  component: AuthLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  beforeLoad: requireAuth,
  component: DashboardPage,
});

const loginRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/login',
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/register',
  component: RegisterPage,
});

const oauthCallbackRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/auth/callback',
  component: OAuthCallbackPage,
});

const invitationAcceptRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/invitations/$token',
  component: AcceptInvitationPage,
});

const reportsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/reports',
  beforeLoad: requireAuth,
  component: TestResultsPage,
});

const reportsCompareRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/reports/compare',
  beforeLoad: requireAuth,
  component: ReportsComparePage,
});

const executionsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/executions',
  beforeLoad: requireAuth,
  component: ExecutionsPage,
});

const analyticsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/analytics',
  beforeLoad: requireAuth,
  component: AnalyticsPage,
});

const qualityGatesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/quality-gates',
  beforeLoad: requireAuth,
  component: QualityGatesPage,
});

const webhooksRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/webhooks',
  beforeLoad: requireAuth,
  component: WebhooksPage,
});

const shardingRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/sharding',
  beforeLoad: requireAuth,
  component: ShardingPage,
});

const adminRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin',
  beforeLoad: requireAuth,
  component: AdminPage,
});

const profileRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/profile',
  beforeLoad: requireAuth,
  component: ProfilePage,
});

export const routeTree = rootRoute.addChildren([
  appLayoutRoute.addChildren([
    indexRoute,
    reportsRoute,
    reportsCompareRoute,
    executionsRoute,
    analyticsRoute,
    qualityGatesRoute,
    webhooksRoute,
    shardingRoute,
    adminRoute,
    profileRoute,
  ]),
  authLayoutRoute.addChildren([
    loginRoute,
    registerRoute,
    oauthCallbackRoute,
    invitationAcceptRoute,
  ]),
]);
