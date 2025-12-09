// Minimal ESLint configuration for monorepo
// Frontend has its own configuration
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.next/**',
      'backend/**',
      'frontend/**',
      'docker/**',
      '**/*.min.js'
    ]
  }
];
