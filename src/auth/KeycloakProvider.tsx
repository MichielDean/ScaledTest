import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from 'react';
import Keycloak from 'keycloak-js';
import { initKeycloak, UserRole } from './keycloak';
import { authLogger as logger, logError } from '../utils/logger';

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
  userProfile: Keycloak.KeycloakProfile | null;
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
  const [userProfile, setUserProfile] = useState<Keycloak.KeycloakProfile | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        setLoading(true);
        const keycloakInstance = initKeycloak();

        // Check if we have tokens stored from direct login
        const storedToken =
          typeof window !== 'undefined' ? localStorage.getItem('keycloak_token') : null;
        const storedRefreshToken =
          typeof window !== 'undefined' ? localStorage.getItem('keycloak_refresh_token') : null;

        const baseOptions = {
          onLoad: 'check-sso' as const,
          silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
          pkceMethod: 'S256' as const,
          checkLoginIframe: false,
        };

        // If we have tokens from direct login, use them for initialization
        type InitOptionValue = string | boolean | undefined;
        const initOptions: Record<string, InitOptionValue> = { ...baseOptions };
        if (storedToken && storedRefreshToken) {
          // Keycloak typings don't include token/refreshToken in the InitOptions,
          // but they are actually supported in the API according to documentation
          initOptions.token = storedToken;
          initOptions.refreshToken = storedRefreshToken;
        }

        // Initialize Keycloak with options
        await keycloakInstance.init(initOptions);

        setKeycloak(keycloakInstance);
        setInitialized(true);
        setIsAuthenticated(keycloakInstance.authenticated === true);
        setToken(keycloakInstance.token);

        if (keycloakInstance.authenticated) {
          try {
            const profile = await keycloakInstance.loadUserProfile();
            setUserProfile(profile);
          } catch (profileError) {
            logError(logger, 'Failed to load user profile', profileError, {
              userId: keycloakInstance.subject,
              tokenExpiration: keycloakInstance.tokenParsed?.exp,
            });
          }
        }

        // Set up token refresh
        keycloakInstance.onTokenExpired = () => {
          keycloakInstance
            .updateToken(30)
            .then((refreshed: boolean) => {
              if (refreshed) {
                setToken(keycloakInstance.token);

                // Update stored tokens if they were refreshed
                if (typeof window !== 'undefined') {
                  localStorage.setItem('keycloak_token', keycloakInstance.token || '');
                  if (keycloakInstance.refreshToken) {
                    localStorage.setItem('keycloak_refresh_token', keycloakInstance.refreshToken);
                  }
                }
              }
            })
            .catch(error => {
              logger.error(
                {
                  err: error,
                  userId: keycloakInstance.subject,
                  tokenExpiry: keycloakInstance.tokenParsed?.exp,
                  refreshTokenExpiry: keycloakInstance.refreshTokenParsed?.exp,
                },
                'Failed to refresh token'
              );
              // Clear stored tokens on refresh failure
              if (typeof window !== 'undefined') {
                localStorage.removeItem('keycloak_token');
                localStorage.removeItem('keycloak_refresh_token');

                // Handle logout locally instead of calling the logout function
                if (keycloakInstance) {
                  // Redirect to login page
                  window.location.href = window.location.origin + '/login';

                  // This will happen after the redirect
                  keycloakInstance.logout({
                    redirectUri: window.location.origin + '/login',
                  });
                }
              }
            });
        };

        // Handle auth state changes
        keycloakInstance.onAuthSuccess = () => {
          setIsAuthenticated(true);
          setToken(keycloakInstance.token);

          // Store tokens on successful authentication
          if (typeof window !== 'undefined') {
            localStorage.setItem('keycloak_token', keycloakInstance.token || '');
            if (keycloakInstance.refreshToken) {
              localStorage.setItem('keycloak_refresh_token', keycloakInstance.refreshToken);
            }
          }
        };

        keycloakInstance.onAuthError = () => {
          setError('Authentication error');
          // Clear stored tokens on auth error
          if (typeof window !== 'undefined') {
            localStorage.removeItem('keycloak_token');
            localStorage.removeItem('keycloak_refresh_token');
          }
        };

        keycloakInstance.onAuthLogout = () => {
          setIsAuthenticated(false);
          setToken(undefined);
          setUserProfile(null);

          // Clear stored tokens on logout
          if (typeof window !== 'undefined') {
            localStorage.removeItem('keycloak_token');
            localStorage.removeItem('keycloak_refresh_token');
          }
        };
      } catch (err) {
        setError('Failed to initialize authentication');
        logError(logger, 'Keycloak initialization failed', err, {
          realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM,
          url: process.env.NEXT_PUBLIC_KEYCLOAK_URL,
          clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID,
        });

        // Clear stored tokens on init error
        if (typeof window !== 'undefined') {
          localStorage.removeItem('keycloak_token');
          localStorage.removeItem('keycloak_refresh_token');
        }
      } finally {
        setLoading(false);
      }
    };

    if (typeof window !== 'undefined') {
      initAuth();
    }
  }, []);

  // Separate useEffect for cleanup to avoid dependency issues
  useEffect(() => {
    return () => {
      if (keycloak) {
        keycloak.onTokenExpired = undefined;
        keycloak.onAuthSuccess = undefined;
        keycloak.onAuthError = undefined;
        keycloak.onAuthLogout = undefined;
      }
    };
  }, [keycloak]);

  const login = useCallback(() => {
    if (keycloak) {
      // Get the current URL to set as redirectUri
      const currentPath = window.location.pathname;
      const redirectUri =
        window.location.origin + (currentPath === '/login' ? '/dashboard' : currentPath);

      keycloak.login({
        redirectUri: redirectUri,
      });
    }
  }, [keycloak]);

  const logout = useCallback(() => {
    if (keycloak) {
      // Clear stored tokens
      if (typeof window !== 'undefined') {
        localStorage.removeItem('keycloak_token');
        localStorage.removeItem('keycloak_refresh_token');

        // Redirect to login page immediately instead of waiting for Keycloak
        // We'll still call keycloak.logout, but we'll redirect first
        window.location.href = window.location.origin + '/login';
      }

      // This will happen after the redirect
      keycloak.logout({
        redirectUri: window.location.origin + '/login',
      });
    }
  }, [keycloak]);

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

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export default KeycloakProvider;
