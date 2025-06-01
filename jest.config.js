// Define common configuration options for all projects
const commonConfig = {
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transformIgnorePatterns: [
    // By default, Jest ignores node_modules from transformation
    // We need to transform keycloak-js because it uses ES modules
    'node_modules/(?!(keycloak-js)/)',
  ],
  testEnvironment: 'node',
};

// Define Playwright-specific config
const playwrightConfig = {
  ...commonConfig,
  setupFilesAfterEnv: ['<rootDir>/tests/jest-playwright-setup.js'],
};

module.exports = {
  projects: [
    {
      displayName: 'Unit',
      ...commonConfig,
      testMatch: ['**/tests/unit/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/unit/setup.ts'],
      // Add global teardown to close resources properly
      globalTeardown: '<rootDir>/tests/utils/closeHandles.js',
    },
    {
      displayName: 'Integration',
      ...commonConfig,
      testMatch: ['**/tests/integration/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.ts'],
      // Add global teardown to close resources properly
      globalTeardown: '<rootDir>/tests/utils/closeHandles.js',
    },
    {
      displayName: 'System',
      ...playwrightConfig,
      testMatch: ['**/tests/system/**/*.test.ts', '**/tests/ui/**/*.test.ts'],
      globalSetup: '<rootDir>/tests/system/setup.ts',
      globalTeardown: '<rootDir>/tests/system/teardown.ts',
    },
  ],
  testTimeout: 60000,
};
