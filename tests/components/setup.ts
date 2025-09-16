import '@testing-library/jest-dom';
import React from 'react';
import { setupTestEnv } from '../setup/environmentConfiguration';

// Component Test Setup

// Setup test environment
setupTestEnv();

// Mock the migration module to prevent actual migrations during tests
jest.mock('../../src/lib/migrations', () => ({
  runMigrations: jest.fn().mockResolvedValue(undefined),
  checkMigrationStatus: jest.fn().mockResolvedValue(false), // No pending migrations
  ensureDatabaseSchema: jest.fn().mockResolvedValue(undefined),
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    pathname: '/',
    query: {},
    asPath: '/',
    route: '/',
  })),
  useSearchParams: jest.fn(() => ({
    get: jest.fn(),
  })),
  usePathname: jest.fn(() => '/'),
}));

// Mock Next.js components
jest.mock('next/head', () => {
  return function Head({ children }: { children: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  };
});

jest.mock('next/link', () => {
  return function Link({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
    return React.createElement('a', { href, ...props }, children);
  };
});

// Mock Better Auth client
jest.mock('@/lib/auth-client', () => ({
  auth: {
    signIn: jest.fn().mockResolvedValue({ data: null, error: null }),
    signOut: jest.fn().mockResolvedValue({ data: null, error: null }),
    signUp: jest.fn().mockResolvedValue({ data: null, error: null }),
    getSession: jest.fn().mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'test@scaledtest.com',
          name: 'Test User',
          role: 'admin',
        },
        session: {
          id: 'session-123',
          userId: 'user-123',
          token: 'mock-token',
        },
      },
      error: null,
    }),
  },
}));

// Mock authentication context
jest.mock('../../src/auth/BetterAuthProvider', () => ({
  useBetterAuth: jest.fn(() => ({
    user: {
      id: 'user-123',
      email: 'test@scaledtest.com',
      name: 'Test User',
      role: 'admin',
    },
    session: {
      id: 'session-123',
      userId: 'user-123',
      token: 'mock-token',
    },
    isAuthenticated: true,
    isLoading: false,
    signIn: jest.fn(),
    signOut: jest.fn(),
    signUp: jest.fn(),
  })),
  BetterAuthProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

// Global fetch mock for API calls
global.fetch = jest.fn();

// Mock CSS modules
jest.mock(
  'identity-obj-proxy',
  () =>
    new Proxy(
      {},
      {
        get: function (target, prop) {
          return prop;
        },
      }
    )
);

// Mock CSS module imports specifically for Charts
jest.mock('../../src/styles/Charts.module.css', () => ({
  card: 'card',
  chartContainer: 'chartContainer',
  loadingContent: 'loadingContent',
  loadingSpinner: 'loadingSpinner',
  loadingText: 'loadingText',
  loadingSubtext: 'loadingSubtext',
  errorContent: 'errorContent',
  errorTitle: 'errorTitle',
  errorMessage: 'errorMessage',
  retryButton: 'retryButton',
  dataSourceIndicator: 'dataSourceIndicator',
  dataSourceHeader: 'dataSourceHeader',
  dataSourceInfo: 'dataSourceInfo',
  dataSourceTitle: 'dataSourceTitle',
  dataSourceDetails: 'dataSourceDetails',
  dataSourceControls: 'dataSourceControls',
  timeRangeSelect: 'timeRangeSelect',
  refreshButton: 'refreshButton',
  noDataContainer: 'noDataContainer',
  noDataTitle: 'noDataTitle',
  noDataMessage: 'noDataMessage',
  noDataSubtext: 'noDataSubtext',
  checkAgainButton: 'checkAgainButton',
  chartTitle: 'chartTitle',
}));

// Mock crypto for test environment
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: jest.fn(() => '00000000-0000-0000-0000-000000000000'),
  },
});

// Setup cleanup
afterEach(() => {
  jest.clearAllMocks();
});
