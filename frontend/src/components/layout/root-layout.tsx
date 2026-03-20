import { Outlet, Link } from '@tanstack/react-router';
import { useAuth } from '../../hooks/use-auth';

export function RootLayout() {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b">
        <div className="flex h-14 items-center px-6 gap-6">
          <Link to="/" id="nav-home" className="font-bold text-lg">
            ScaledTest
          </Link>
          {isAuthenticated && (
            <div className="flex gap-4 text-sm">
              <Link
                to="/"
                id="nav-dashboard"
                className="text-muted-foreground hover:text-foreground [&.active]:text-foreground"
              >
                Dashboard
              </Link>
              <Link
                to="/reports"
                id="nav-reports"
                className="text-muted-foreground hover:text-foreground [&.active]:text-foreground"
              >
                Reports
              </Link>
              <Link
                to="/executions"
                id="nav-executions"
                className="text-muted-foreground hover:text-foreground [&.active]:text-foreground"
              >
                Executions
              </Link>
              <Link
                to="/analytics"
                id="nav-analytics"
                className="text-muted-foreground hover:text-foreground [&.active]:text-foreground"
              >
                Analytics
              </Link>
              <Link
                to="/quality-gates"
                id="nav-quality-gates"
                className="text-muted-foreground hover:text-foreground [&.active]:text-foreground"
              >
                Quality Gates
              </Link>
              <Link
                to="/webhooks"
                id="nav-webhooks"
                className="text-muted-foreground hover:text-foreground [&.active]:text-foreground"
              >
                Webhooks
              </Link>
              <Link
                to="/sharding"
                id="nav-sharding"
                className="text-muted-foreground hover:text-foreground [&.active]:text-foreground"
              >
                Sharding
              </Link>
              {user?.role === 'owner' && (
                <Link
                  to="/admin"
                  id="nav-admin"
                  className="text-muted-foreground hover:text-foreground [&.active]:text-foreground"
                >
                  Admin
                </Link>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <Link
                  to="/profile"
                  id="nav-profile"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {user?.display_name || user?.email}
                </Link>
                <button
                  id="btn-sign-out"
                  onClick={() => logout()}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Sign Out
                </button>
              </>
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
        </div>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
