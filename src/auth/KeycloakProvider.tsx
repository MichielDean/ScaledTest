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
import { authLogger as logger, logError } from '../logging/logger';
import { updateKeycloakConfig } from '../authentication/keycloakConfig';
import {
  getStoredToken,
  getStoredRefreshToken,
  storeTokens,
  clearTokens,
} from '../authentication/keycloakTokenManager';
import keycloakConfig from '../config/keycloak';

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

        updateKeycloakConfig();

        const keycloakInstance = initKeycloak();

        // Check if we have tokens stored from direct login
        const storedToken = getStoredToken();
        const storedRefreshToken = getStoredRefreshToken();

        // Fast initialization options - never auto-redirect to Keycloak login
        const baseOptions = {
          onLoad: 'check-sso' as const, // Always use check-sso to avoid auto-redirects
          silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
          pkceMethod: 'S256' as const,
          checkLoginIframe: false,
          enabledHostedDomain3pCookies: false, // Disable 3p cookie checks to avoid delays
          flow: 'standard' as const,
          responseMode: 'fragment' as const,
        };

        // If we have tokens from direct login, use them for initialization
        type InitOptionValue = string | boolean | undefined;
        const initOptions: Record<string, InitOptionValue> = { ...baseOptions };
        if (storedToken && storedRefreshToken) {
          // When we have stored tokens, use them directly
          // Keycloak typings don't include token/refreshToken in the InitOptions,
          // but they are actually supported in the API according to documentation
          initOptions.token = storedToken;
          initOptions.refreshToken = storedRefreshToken;
        }

        await keycloakInstance.init(initOptions);

        setKeycloak(keycloakInstance);
        setInitialized(true);
        setIsAuthenticated(keycloakInstance.authenticated === true);
        setToken(keycloakInstance.token);

        // Load user profile in the background after initial auth setup
        // This prevents blocking the UI during initial load
        if (keycloakInstance.authenticated) {
          // Don't await this - let it load in background
          keycloakInstance
            .loadUserProfile()
            .then(profile => setUserProfile(profile))
            .catch(profileError => {
              logError(logger, 'Failed to load user profile', profileError, {
                userId: keycloakInstance.subject,
                tokenExpiration: keycloakInstance.tokenParsed?.exp,
              });
            });
        }

        // Set up token refresh
        keycloakInstance.onTokenExpired = () => {
          keycloakInstance
            .updateToken(30)
            .then((refreshed: boolean) => {
              if (refreshed) {
                setToken(keycloakInstance.token);

                // Update stored tokens if they were refreshed
                if (keycloakInstance.token && keycloakInstance.refreshToken) {
                  storeTokens(keycloakInstance.token, keycloakInstance.refreshToken);
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

              clearTokens();

              // Handle logout locally instead of calling the logout function
              if (keycloakInstance) {
                // Redirect to login page
                window.location.href = window.location.origin + '/login';

                // This will happen after the redirect
                keycloakInstance.logout({
                  redirectUri: window.location.origin + '/login',
                });
              }
            });
        };

        // Handle auth state changes
        keycloakInstance.onAuthSuccess = () => {
          setIsAuthenticated(true);
          setToken(keycloakInstance.token);

          if (keycloakInstance.token && keycloakInstance.refreshToken) {
            storeTokens(keycloakInstance.token, keycloakInstance.refreshToken);
          }
        };

        keycloakInstance.onAuthError = () => {
          setError('Authentication error');
          clearTokens();
        };

        keycloakInstance.onAuthLogout = () => {
          setIsAuthenticated(false);
          setToken(undefined);
          setUserProfile(null);

          clearTokens();
        };
      } catch (err) {
        setError('Failed to initialize authentication');
        logError(logger, 'Keycloak initialization failed', err, {
          realm: keycloakConfig.realm,
          url: keycloakConfig.url,
          clientId: keycloakConfig.clientId,
        });

        clearTokens();
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
    // This login function is for Keycloak-hosted login
    // Since you're using a custom login page, this shouldn't auto-redirect
    // The custom login page uses directLogin from keycloakTokenManager instead
    if (keycloak) {
      const currentPath = window.location.pathname;
      const redirectUri =
        window.location.origin + (currentPath === '/login' ? '/dashboard' : currentPath);

      // Only redirect to Keycloak if explicitly called (not automatically)
      keycloak.login({
        redirectUri: redirectUri,
      });
    }
  }, [keycloak]);

  const logout = useCallback(() => {
    if (keycloak) {
      clearTokens();

      // Redirect to login page immediately instead of waiting for Keycloak
      // We'll still call keycloak.logout, but we'll redirect first
      window.location.href = window.location.origin + '/login';

      // This will happen after the redirect
      keycloak.logout({
        redirectUri: window.location.origin + '/login',
      });
    }
  }, [keycloak]);

  const hasRole = (role: UserRole): boolean => {
    if (!keycloak || !keycloak.authenticated) return false;
    return keycloak.hasRealmRole(role);
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
