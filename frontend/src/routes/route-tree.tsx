import { createRootRoute, createRoute, redirect } from '@tanstack/react-router'
import { RootLayout } from '../components/layout/root-layout'
import { DashboardPage } from './dashboard'
import { LoginPage } from './login'
import { RegisterPage } from './register'
import { OAuthCallbackPage } from './oauth-callback'
import { ExecutionsPage } from './executions'
import { QualityGatesPage } from './quality-gates'
import { AdminPage } from './admin'
import { useAuthStore } from '../stores/auth-store'

function requireAuth() {
  if (!useAuthStore.getState().isAuthenticated) {
    throw redirect({ to: '/login' })
  }
}

const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: requireAuth,
  component: DashboardPage,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: RegisterPage,
})

const oauthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: OAuthCallbackPage,
})

const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reports',
  beforeLoad: requireAuth,
  component: () => <div className="p-6"><h1 className="text-2xl font-bold">Reports</h1><p className="text-muted-foreground mt-2">Test reports will appear here.</p></div>,
})

const executionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/executions',
  beforeLoad: requireAuth,
  component: ExecutionsPage,
})

const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/analytics',
  beforeLoad: requireAuth,
  component: () => <div className="p-6"><h1 className="text-2xl font-bold">Analytics</h1><p className="text-muted-foreground mt-2">Test analytics will appear here.</p></div>,
})

const qualityGatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/quality-gates',
  beforeLoad: requireAuth,
  component: QualityGatesPage,
})

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  beforeLoad: requireAuth,
  component: AdminPage,
})

export const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  oauthCallbackRoute,
  reportsRoute,
  executionsRoute,
  analyticsRoute,
  qualityGatesRoute,
  adminRoute,
])
