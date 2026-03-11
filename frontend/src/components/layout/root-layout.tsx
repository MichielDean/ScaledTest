import { Outlet, Link } from '@tanstack/react-router'
import { useAuth } from '../../hooks/use-auth'

export function RootLayout() {
  const { user, isAuthenticated, logout } = useAuth()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b">
        <div className="flex h-14 items-center px-6 gap-6">
          <Link to="/" className="font-bold text-lg">ScaledTest</Link>
          {isAuthenticated && (
            <div className="flex gap-4 text-sm">
              <Link to="/" className="text-muted-foreground hover:text-foreground [&.active]:text-foreground">Dashboard</Link>
              <Link to="/reports" className="text-muted-foreground hover:text-foreground [&.active]:text-foreground">Reports</Link>
              <Link to="/executions" className="text-muted-foreground hover:text-foreground [&.active]:text-foreground">Executions</Link>
              <Link to="/analytics" className="text-muted-foreground hover:text-foreground [&.active]:text-foreground">Analytics</Link>
              <Link to="/quality-gates" className="text-muted-foreground hover:text-foreground [&.active]:text-foreground">Quality Gates</Link>
              {user?.role === 'owner' && (
                <Link to="/admin" className="text-muted-foreground hover:text-foreground [&.active]:text-foreground">Admin</Link>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-muted-foreground">{user?.display_name || user?.email}</span>
                <button
                  onClick={() => logout()}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
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
  )
}
