import '@testing-library/jest-dom';
import React from 'react';
import { setupOpenSearchTestEnv } from '../utils/testEnvSetup';

// Setup OpenSearch test environment
setupOpenSearchTestEnv();

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

// Mock Keycloak
jest.mock('keycloak-js', () => {
  return function Keycloak() {
    return {
      init: jest.fn().mockResolvedValue(true),
      login: jest.fn(),
      logout: jest.fn(),
      register: jest.fn(),
      updateToken: jest.fn().mockResolvedValue(true),
      authenticated: true,
      token: 'mock-token',
      tokenParsed: {
        sub: 'user-123',
        preferred_username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
      },
    };
  };
});

// Mock jose
jest.mock('jose', () => ({
  jwtVerify: jest.fn().mockResolvedValue({
    payload: {
      sub: 'user-123',
      aud: 'scaledtest-client',
      resource_access: {
        'scaledtest-client': {
          roles: ['owner', 'maintainer', 'readonly'],
        },
      },
    },
  }),
  createRemoteJWKSet: jest.fn().mockReturnValue('mocked-jwks'),
}));

// Mock authentication context
jest.mock('../../src/auth/KeycloakProvider', () => ({
  useAuth: jest.fn(() => ({
    keycloak: {
      authenticated: true,
      token: 'mock-token',
      tokenParsed: {
        sub: 'user-123',
        preferred_username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
      },
    },
    token: 'mock-token',
    user: {
      sub: 'user-123',
      preferred_username: 'testuser',
      email: 'test@example.com',
      name: 'Test User',
    },
    isAuthenticated: true,
    isLoading: false,
  })),
  KeycloakProvider: ({ children }: { children: React.ReactNode }) =>
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
