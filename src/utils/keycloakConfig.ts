import { authLogger as logger, logError } from './logger';
import { keycloakJsonConfig } from '../config/keycloak';

// This utility creates a dynamic keycloak.json config in the browser
export function updateKeycloakConfig(): void {
  if (typeof window !== 'undefined') {
    try {
      // Create a blob with the configured JSON
      const config = JSON.stringify(keycloakJsonConfig);
      const blob = new Blob([config], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // Create a link to the dynamic config and append it to document head
      const link = document.createElement('link');
      link.rel = 'keycloak-config';
      link.href = url;
      document.head.appendChild(link);

      logger.info('Dynamic Keycloak configuration created');
    } catch (error) {
      logError(logger, 'Failed to create dynamic keycloak config', error, {
        realm: keycloakJsonConfig.realm,
        url: keycloakJsonConfig['auth-server-url'],
      });
    }
  }
}
