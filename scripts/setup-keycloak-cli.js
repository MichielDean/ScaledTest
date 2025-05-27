#!/usr/bin/env node

/**
 * Keycloak Setup CLI Wrapper
 *
 * This script provides a command-line interface for the Keycloak setup script,
 * allowing users to pass configuration values as command-line arguments.
 *
 * Usage:
 *   node setup-keycloak-cli.js --realm=myrealm --client-id=myclient
 */

const { setup } = require('./setup-keycloak');

// Process command-line arguments
function processArgs() {
  const args = process.argv.slice(2);

  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      if (value) {
        // Convert key from kebab-case to environment variable format
        const envKey = 'KEYCLOAK_' + key.toUpperCase().replace(/-/g, '_');
        process.env[envKey] = value;
      }
    }
  });
}

// Display help information
function showHelp() {
  console.log(`
Keycloak Setup CLI

Usage:
  node setup-keycloak-cli.js [options]

Required Options:
  --url=URL                  Keycloak server URL
  --admin-user=USERNAME      Admin username
  --admin-password=PASSWORD  Admin password
  --realm=REALM              Realm name
  --realm-display-name=NAME  Realm display name
  --client-id=CLIENT_ID      Client ID

Optional Options:
  --redirect-uris=URIs       Comma-separated redirect URIs (default: http://localhost:3000/*)
  --web-origins=ORIGINS      Comma-separated web origins (default: *)
  --roles=ROLES              Comma-separated role names (default: readonly,maintainer,owner)
  --registration-allowed=BOOL Enable/disable registration (default: true)
  --reset-password-allowed=BOOL Enable/disable password reset (default: true)
  --remember-me=BOOL         Enable/disable remember me feature (default: true)
  --verify-email=BOOL        Enable/disable email verification (default: false)
  --login-with-email=BOOL    Enable/disable login with email (default: true)
  --max-retries=NUM          Maximum number of connection retries (default: 30)
  --retry-interval=MS        Retry interval in milliseconds (default: 2000)
  --help                     Show this help information

User Creation Examples:
  # To create a readonly user:
  --readonly-user-username=USERNAME --readonly-user-password=PASSWORD

  # To create a maintainer user:
  --maintainer-user-username=USERNAME --maintainer-user-password=PASSWORD

  # To create an owner user:
  --owner-user-username=USERNAME --owner-user-password=PASSWORD

Example:
  node setup-keycloak-cli.js --url=http://localhost:8080 --realm=scaledtest --client-id=scaledtest-client
  `);
}

// Main function
async function main() {
  if (process.argv.includes('--help')) {
    showHelp();
    return;
  }

  processArgs();
  await setup();
}

// Run the script
main().catch(error => {
  console.error('Setup failed:', error.message);
  process.exit(1);
});
