import type { Config } from 'jest';

// Shared configuration constants
const SHARED_CONFIG = {
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transformIgnorePatterns: [
    // By default, Jest ignores node_modules from transformation
    // We need to transform keycloak-js because it uses ES modules
    'node_modules/(?!(keycloak-js)/)',
  ],
  globalTeardown: '<rootDir>/tests/teardown/handleCleanup.ts',
  testTimeout: 60000,
};

// Base configuration factory
const createBaseConfig = (): Partial<Config> => ({
  ...SHARED_CONFIG,
  preset: 'ts-jest',
});

// Node environment configuration factory
const createNodeConfig = (): Config => ({
  ...createBaseConfig(),
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
});

// JSDOM environment configuration factory
const createJSDOMConfig = (): Config => ({
  ...createBaseConfig(),
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/tests/components/jest-setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: false,
        tsconfig: {
          jsx: 'react-jsx',
        },
      },
    ],
  },
});

// Reporters configuration
const REPORTERS_CONFIG: Config['reporters'] = [
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
];

const config: Config = {
  reporters: REPORTERS_CONFIG,
  projects: [
    {
      ...createNodeConfig(),
      displayName: 'Unit',
      testMatch: ['**/tests/unit/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/unit/setup.ts'],
    },
    {
      ...createJSDOMConfig(),
      displayName: 'Components',
      testMatch: ['**/tests/components/**/*.test.{ts,tsx}'],
      setupFilesAfterEnv: ['<rootDir>/tests/components/setup.ts'],
    },
    {
      ...createNodeConfig(),
      displayName: 'Integration',
      testMatch: ['**/tests/integration/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.ts'],
    },
    {
      ...createNodeConfig(),
      displayName: 'System',
      testMatch: ['**/tests/system/**/*.test.ts', '**/tests/ui/**/*.test.ts'],
      globalSetup: '<rootDir>/tests/system/setup.ts',
      globalTeardown: '<rootDir>/tests/system/teardown.ts',
    },
  ],
};

export default config;
