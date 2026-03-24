import { Outlet, Link } from '@tanstack/react-router';
import {
  LayoutDashboard,
  BarChart2,
  Play,
  TrendingUp,
  ShieldCheck,
  Webhook,
  Layers,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../hooks/use-auth';

const NAV_LINK_CLASS =
  'flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors [&.active]:text-primary [&.active]:bg-primary/10 [&.active]:font-medium';

const NAV_ITEMS = [
  { to: '/', id: 'nav-dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/reports', id: 'nav-reports', icon: BarChart2, label: 'Reports' },
  { to: '/executions', id: 'nav-executions', icon: Play, label: 'Executions' },
  { to: '/analytics', id: 'nav-analytics', icon: TrendingUp, label: 'Analytics' },
  { to: '/quality-gates', id: 'nav-quality-gates', icon: ShieldCheck, label: 'Quality Gates' },
  { to: '/webhooks', id: 'nav-webhooks', icon: Webhook, label: 'Webhooks' },
  { to: '/sharding', id: 'nav-sharding', icon: Layers, label: 'Sharding' },
] as const;

export function RootLayout() {
  const { user, isAuthenticated, logout } = useAuth();

  const userInitial = (user?.display_name || user?.email || 'U').charAt(0).toUpperCase();
  const userLabel = user?.display_name || user?.email || '';

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Fixed left sidebar */}
      <aside className="fixed top-0 left-0 h-screen w-[220px] bg-card border-r border-border flex flex-col z-40">
        {/* Logo / wordmark */}
        <div className="px-4 py-5 border-b border-border shrink-0">
          <Link to="/" id="nav-home" className="font-bold text-base text-foreground no-underline">
            ScaledTest
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {isAuthenticated && (
            <ul className="space-y-0.5 list-none p-0 m-0">
              {NAV_ITEMS.map(({ to, id, icon: Icon, label }) => (
                <li key={id}>
                  <Link
                    to={to}
                    id={id}
                    className={NAV_LINK_CLASS}
                  >
                    <Icon size={16} className="shrink-0" />
                    {label}
                  </Link>
                </li>
              ))}
              {user?.role === 'owner' && (
                <li>
                  <Link
                    to="/admin"
                    id="nav-admin"
                    className={NAV_LINK_CLASS}
                  >
                    <Settings size={16} className="shrink-0" />
                    Admin
                  </Link>
                </li>
              )}
            </ul>
          )}
        </nav>

        {/* Bottom: user avatar + sign out */}
        <div className="shrink-0 border-t border-border px-3 py-3">
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <Link
                to="/profile"
                id="nav-profile"
                className="flex items-center gap-2 flex-1 min-w-0 no-underline"
              >
                <div className="h-7 w-7 rounded-full bg-muted text-foreground text-xs font-medium flex items-center justify-center shrink-0">
                  {userInitial}
                </div>
                <span className="text-sm text-muted-foreground truncate">{userLabel}</span>
              </Link>
              <button
                id="btn-sign-out"
                onClick={() => logout()}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0 p-1 rounded"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              id="nav-sign-in"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Sign In
            </Link>
          )}
        </div>
      </aside>

      {/* Main content — offset by sidebar width */}
      <main className="ml-[220px] flex-1 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
