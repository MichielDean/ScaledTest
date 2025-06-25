/* eslint-env jest */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports, no-console */
// Jest setup for components - add polyfills and globals needed for jsdom environment
// This file necessarily uses any types and console statements for test environment setup

// Import statements
import { TextEncoder, TextDecoder } from 'util';

// Add setImmediate polyfill for jsdom environment
global.setImmediate =
  global.setImmediate ||
  ((fn: (...args: any[]) => void, ...args: any[]) => global.setTimeout(fn, 0, ...args));
global.clearImmediate = global.clearImmediate || global.clearTimeout;

// Add TextEncoder/TextDecoder polyfill for jsdom
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

// Mock IntersectionObserver for jsdom environment
(global as any).IntersectionObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock ResizeObserver for chart components (Recharts)
(global as any).ResizeObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Suppress console warnings from libraries during tests
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  // Filter out known warnings that are not relevant to tests
  const message = args[0];
  if (
    typeof message === 'string' &&
    (message.includes('Warning: React.createElement') ||
      message.includes('Warning: validateDOMNesting') ||
      message.includes('Warning: Each child in a list'))
  ) {
    return;
  }
  originalWarn.apply(console, args);
};
