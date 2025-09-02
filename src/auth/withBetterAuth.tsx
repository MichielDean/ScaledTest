import React from 'react';
import { useBetterAuth } from './BetterAuthProvider';
import { type Role } from '@/lib/permissions';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

interface WithBetterAuthOptions {
  requiredRoles?: Role[];
  redirectTo?: string;
  redirectToLogin?: boolean;
}

// HOC that wraps components to require authentication
export function withBetterAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: WithBetterAuthOptions = {}
) {
  const { requiredRoles = [], redirectTo = '/unauthorized', redirectToLogin = true } = options;

  const WithAuthComponent: React.FC<P> = props => {
    const { isAuthenticated, loading, hasRole, user } = useBetterAuth();
    const router = useRouter();

    useEffect(() => {
      if (loading) return; // Still loading, don't redirect yet

      if (!isAuthenticated) {
        if (redirectToLogin) {
          router.push('/login');
        } else {
          router.push(redirectTo);
        }
        return;
      }

      // Check role requirements
      if (requiredRoles.length > 0) {
        const hasRequiredRole = requiredRoles.some(role => hasRole(role));
        if (!hasRequiredRole) {
          router.push(redirectTo);
          return;
        }
      }
    }, [isAuthenticated, loading, user, router, hasRole]);

    // Show loading state while checking authentication
    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
        </div>
      );
    }

    // Show nothing while redirecting
    if (!isAuthenticated) {
      return null;
    }

    // Check role requirements before rendering
    if (requiredRoles.length > 0) {
      const hasRequiredRole = requiredRoles.some(role => hasRole(role));
      if (!hasRequiredRole) {
        return null;
      }
    }

    return <WrappedComponent {...props} />;
  };

  WithAuthComponent.displayName = `withBetterAuth(${WrappedComponent.displayName || WrappedComponent.name})`;

  return WithAuthComponent;
}

// Convenience function for backward compatibility with existing withAuth usage
export default function withAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  requiredRoles?: Role[]
) {
  return withBetterAuth(WrappedComponent, { requiredRoles });
}

// Export for consistency with legacy API
export { withBetterAuth as withAuth };
