/* eslint-env jest */
// Jest setup for components - add polyfills and globals needed for jsdom environment

// Add setImmediate polyfill for jsdom environment
global.setImmediate = global.setImmediate || ((fn, ...args) => global.setTimeout(fn, 0, ...args));
global.clearImmediate = global.clearImmediate || global.clearTimeout;

// Add TextEncoder/TextDecoder polyfill for jsdom
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock IntersectionObserver for jsdom environment
global.IntersectionObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock ResizeObserver for chart components (Recharts)
global.ResizeObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Suppress console warnings from libraries during tests
const originalWarn = console.warn;
console.warn = (...args) => {
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
