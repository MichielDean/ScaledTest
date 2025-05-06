import React, { ComponentType, useEffect } from 'react';
import { useAuth } from './KeycloakProvider';
import { UserRole } from './keycloak';

// Options for the withAuth HOC
interface WithAuthOptions {
  requiredRoles?: UserRole[]; // Specific roles required to access the component
  redirectTo?: string; // Where to redirect if authentication fails
}

// Higher-Order Component (HOC) to protect routes that require authentication
export const withAuth = <P extends object>(
  Component: ComponentType<P>,
  options: WithAuthOptions = {}
) => {
  const { requiredRoles, redirectTo = '/login' } = options;
  
  const WithAuthComponent: React.FC<P> = (props) => {
    const { isAuthenticated, loading, hasRole } = useAuth();
    
    useEffect(() => {
      // Skip if still loading
      if (loading) return;
      
      // Check if user is authenticated
      if (!isAuthenticated) {
        window.location.href = redirectTo;
        return;
      }
      
      // Check if specific roles are required
      if (requiredRoles && requiredRoles.length > 0) {
        // Check if user has at least one of the required roles
        const hasRequiredRole = requiredRoles.some(role => hasRole(role));
        
        if (!hasRequiredRole) {
          // User doesn't have any of the required roles
          window.location.href = '/unauthorized';
        }
      }
    }, [isAuthenticated, loading, hasRole]);
    
    // Show nothing while loading
    if (loading) {
      return <div>Loading...</div>;
    }
    
    // If not authenticated, return null (will be redirected)
    if (!isAuthenticated) {
      return null;
    }
    
    // If roles are required, check if user has at least one
    if (requiredRoles && requiredRoles.length > 0) {
      const hasRequiredRole = requiredRoles.some(role => hasRole(role));
      
      if (!hasRequiredRole) {
        return null; // Will be redirected to unauthorized page
      }
    }
    
    // User is authenticated and has required roles, render the component
    return <Component {...props} />;
  };
  
  return WithAuthComponent;
};

export default withAuth;