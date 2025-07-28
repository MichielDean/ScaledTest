#!/bin/bash

# Keycloak entrypoint script that ensures admin user creation

export KEYCLOAK_ADMIN=${KC_BOOTSTRAP_ADMIN_USERNAME}
export KEYCLOAK_ADMIN_PASSWORD=${KC_BOOTSTRAP_ADMIN_PASSWORD}

# Start Keycloak
exec /opt/keycloak/bin/kc.sh "$@"
