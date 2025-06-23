/**
 * Centralized exports for all type definitions
 *
 * This file provides easy access to all type definitions across the application.
 * Import from here to access any interface or type used in the project.
 */

// Common base interfaces
export * from './apiResponses';

// Domain-specific interfaces
export * from './api';
export * from './auth';
export * from './user';
export * from './database';
export * from './dashboard';
export * from './opensearch';
export * from './validation';

// CTRF schema types
export * from '../schemas/ctrf/ctrf';
