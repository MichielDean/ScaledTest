// Thin compatibility layer that re-exports the canonical team management
// helpers from `src/lib/teamManagement`. Keep a small set of wrappers for
// functions that require a different signature to remain backward compatible.
export * from '../lib/teamManagement';

// For API compatibility: provide a default export matching the legacy shape.
// Consumers that import the module as a default will receive an object with
// named exports attached, preserving prior CommonJS-like usage patterns.
import * as teamLib from '../lib/teamManagement';

const defaultExport = {
  ...teamLib,
};

export default defaultExport;
