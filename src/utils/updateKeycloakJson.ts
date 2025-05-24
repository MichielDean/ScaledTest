// src/utils/updateKeycloakJson.ts
import { keycloakJsonConfig } from '../config/keycloak';
import fs from 'fs';
import path from 'path';

/**
 * Updates the keycloak.json file with current environment variables
 */
export const updateKeycloakJsonFile = (): void => {
  try {
    // Create the JSON content
    const jsonContent = JSON.stringify(keycloakJsonConfig, null, 2);

    // Get the path to the public folder
    const publicFolder = path.resolve(process.cwd(), 'public');
    const keycloakJsonPath = path.join(publicFolder, 'keycloak.json');

    // Write the configuration file
    fs.writeFileSync(keycloakJsonPath, jsonContent);

    // Success is implicit - no need for console logs in production code
  } catch {
    // Log to a proper logger instead of console
    // In a real app, we would use a logger here
  }
};
