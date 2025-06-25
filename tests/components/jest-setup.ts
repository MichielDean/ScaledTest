// Jest setup for components - add polyfills and globals needed for jsdom environment

// Import statements
import { TextEncoder, TextDecoder } from 'util';

// Add setImmediate polyfill for jsdom environment
global.setImmediate =
  global.setImmediate ||
  ((fn: (...args: unknown[]) => void, ...args: unknown[]) => global.setTimeout(fn, 0, ...args));
global.clearImmediate = global.clearImmediate || global.clearTimeout;

// Add TextEncoder/TextDecoder polyfill for jsdom
(global as Record<string, unknown>).TextEncoder = TextEncoder;
(global as Record<string, unknown>).TextDecoder = TextDecoder;

// Mock IntersectionObserver for jsdom environment
(global as Record<string, unknown>).IntersectionObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock ResizeObserver for chart components (Recharts)
(global as Record<string, unknown>).ResizeObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));
