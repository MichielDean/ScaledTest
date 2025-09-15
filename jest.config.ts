import type { Config } from 'jest';

// Shared configuration constants
const SHARED_CONFIG = {
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transformIgnorePatterns: [
    // By default, Jest ignores node_modules from transformation
    // We need to transform node-pg-migrate, glob, better-auth, nanostores and their dependencies because they use ES modules
    'node_modules/(?!(node-pg-migrate|glob|better-auth|nanostores|@better-auth|@nanostores)/)',
  ],
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
  setupFilesAfterEnv: ['<rootDir>/tests/setup/environmentConfiguration.ts'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
});

// JSDOM environment configuration factory
const createJSDOMConfig = (): Config => ({
  ...createBaseConfig(),
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/tests/components/jest-setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/environmentConfiguration.ts'],
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

// Reporters configuration - using Jest's built-in reporters for clean output
const REPORTERS_CONFIG: Config['reporters'] = [
  // Use default reporter for verbose test output with checkmarks
  'default',
  // Keep CTRF reporter for test result collection
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
  testTimeout: 60000,
  verbose: true, // Enable verbose to show individual test names with checkmarks
  silent: true, // Suppress console.log from tests while keeping Jest verbose output
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
      setupFilesAfterEnv: ['<rootDir>/tests/system/jest-setup.ts'],
    },
  ],
};

export default config;
