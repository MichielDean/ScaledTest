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
  // Global reporters configuration - applies to all projects
  reporters: [
    'default',
    [
      'jest-ctrf-json-reporter',
      {
        outputFile: 'ctrf-report.json',
        outputDir: './',
        reportName: 'Jest Test Results',
        appName: 'ScaledTest',
        appVersion: '1.0.0',
        generatedBy: 'jest-ctrf-json-reporter',
      },
    ],
  ],
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
      displayName: 'Components',
      testEnvironment: 'jsdom',
      testMatch: ['**/tests/components/**/*.test.{ts,tsx}'],
      setupFilesAfterEnv: ['<rootDir>/tests/components/setup.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
      },
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            tsconfig: {
              jsx: 'react-jsx',
            },
          },
        ],
      },
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
      transformIgnorePatterns: ['node_modules/(?!(keycloak-js)/)'],
      setupFiles: ['<rootDir>/tests/components/jest-setup.js'],
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
