import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import Keycloak from 'keycloak-js';
import { initKeycloak, UserRole } from './keycloak';

interface AuthContextType {
  keycloak: Keycloak | null;
  initialized: boolean;
  loading: boolean;
  error: string | null;
  login: () => void;
  logout: () => void;
  isAuthenticated: boolean;
  hasRole: (role: UserRole) => boolean;
  token: string | undefined;
  userProfile: any;
}

const AuthContext = createContext<AuthContextType>({
  keycloak: null,
  initialized: false,
  loading: true,
  error: null,
  login: () => {},
  logout: () => {},
  isAuthenticated: false,
  hasRole: () => false,
  token: undefined,
  userProfile: null,
});

export const useAuth = () => useContext(AuthContext);

interface KeycloakProviderProps {
  children: ReactNode;
}

export const KeycloakProvider: React.FC<KeycloakProviderProps> = ({ children }) => {
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [userProfile, setUserProfile] = useState<any>(null);
  
  useEffect(() => {
    // Skip initialization for login and registration pages
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path === '/login' || path === '/register') {
        setLoading(false);
        return;
      }
    }
    
    const initAuth = async () => {
      try {
        setLoading(true);
        const keycloakInstance = initKeycloak();
        
        await keycloakInstance.init({
          onLoad: 'check-sso',
          silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
          pkceMethod: 'S256',
        });
        
        setKeycloak(keycloakInstance);
        setInitialized(true);
        setIsAuthenticated(keycloakInstance.authenticated === true);
        setToken(keycloakInstance.token);
        
        if (keycloakInstance.authenticated) {
          try {
            const profile = await keycloakInstance.loadUserProfile();
            setUserProfile(profile);
          } catch (profileError) {
            console.error('Failed to load user profile', profileError);
          }
        }
        
        // Set up token refresh
        keycloakInstance.onTokenExpired = () => {
          keycloakInstance.updateToken(30).then((refreshed) => {
            if (refreshed) {
              setToken(keycloakInstance.token);
            }
          }).catch(() => {
            console.error('Failed to refresh token');
          });
        };
        
        // Handle auth state changes
        keycloakInstance.onAuthSuccess = () => {
          setIsAuthenticated(true);
          setToken(keycloakInstance.token);
        };
        
        keycloakInstance.onAuthError = () => {
          setError('Authentication error');
        };
        
        keycloakInstance.onAuthLogout = () => {
          setIsAuthenticated(false);
          setToken(undefined);
          setUserProfile(null);
        };
        
      } catch (err) {
        setError('Failed to initialize authentication');
        console.error('Keycloak init error', err);
      } finally {
        setLoading(false);
      }
    };
    
    if (typeof window !== 'undefined') {
      initAuth();
    }
    
    // Cleanup function
    return () => {
      if (keycloak) {
        keycloak.onTokenExpired = undefined;
        keycloak.onAuthSuccess = undefined;
        keycloak.onAuthError = undefined;
        keycloak.onAuthLogout = undefined;
      }
    };
  }, []);
  
  const login = () => {
    if (keycloak) {
      keycloak.login();
    }
  };
  
  const logout = () => {
    if (keycloak) {
      keycloak.logout({
        redirectUri: window.location.origin,
      });
    }
  };
  
  const hasRole = (role: UserRole): boolean => {
    if (!keycloak || !keycloak.authenticated) return false;
    return keycloak.hasResourceRole(role);
  };
  
  const contextValue: AuthContextType = {
    keycloak,
    initialized,
    loading,
    error,
    login,
    logout,
    isAuthenticated,
    hasRole,
    token,
    userProfile,
  };
  
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export default KeycloakProvider;