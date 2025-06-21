/* eslint-env jest */
// Jest setup for components - add polyfills and globals needed for jsdom environment
import { TextEncoder, TextDecoder } from 'util';
import { testLogger } from '../../src/utils/logger';

// Since we're using node test environment now, we don't need setImmediate polyfill
// and we shouldn't try to override it either

// Add TextEncoder/TextDecoder polyfill for jsdom
(global as Record<string, unknown>).TextEncoder = TextEncoder;
(global as Record<string, unknown>).TextDecoder = TextDecoder;

// Mock IntersectionObserver for jsdom environment
(global as Record<string, unknown>).IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock ResizeObserver for chart components (Recharts)
(global as Record<string, unknown>).ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Set up safer logging to prevent tests from logging warnings
// Create a mock filter for console warnings during tests
const filterWarning = (message: string): boolean => {
  if (
    typeof message === 'string' &&
    (message.includes('Warning: React.createElement') ||
      message.includes('Warning: validateDOMNesting') ||
      message.includes('Warning: Each child in a list'))
  ) {
    return true;
  }
  return false;
};

// Replace console.warn with test logger that filters unnecessary warnings
// eslint-disable-next-line no-console
console.warn = jest.fn((...args: unknown[]) => {
  const message = args[0] as string;
  if (filterWarning(message)) {
    return;
  }

  // Log non-filtered warnings properly using the test logger
  testLogger.warn({ message, additionalArgs: args.slice(1) }, 'Warning during test');
});
