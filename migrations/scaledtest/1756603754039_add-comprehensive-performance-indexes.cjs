/**
 * ScaledTest Database Migration - Performance Indexes
 * Target Database: scaledtest
 * Run with: TIMESCALE_DATABASE_URL environment variable
 */
exports.shorthands = undefined;

exports.up = pgm => {
  // This migration combines performance indexes from the script with the existing migration
  // to provide comprehensive indexing for the current schema

  // 1. Primary filter indexes for current schema fields
  pgm.createIndex('test_reports', 'uploaded_by', {
    name: 'idx_test_reports_uploaded_by_v2',
    method: 'btree',
  });

  pgm.createIndex('test_reports', 'tool_name', {
    name: 'idx_test_reports_tool_name_v2',
    method: 'btree',
  });

  pgm.createIndex('test_reports', 'environment_test_environment', {
    name: 'idx_test_reports_environment_v2',
    method: 'btree',
  });

  // 2. Time-based indexes for both timestamp and stored_at
  pgm.createIndex('test_reports', 'stored_at', {
    name: 'idx_test_reports_stored_at',
    method: 'btree',
  });

  pgm.createIndex('test_reports', 'timestamp', {
    name: 'idx_test_reports_timestamp_v2',
    method: 'btree',
  });

  // 3. JSONB indexes for team filtering (enhanced)
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_test_reports_user_teams_enhanced_gin 
    ON test_reports USING GIN (user_teams)
    WHERE user_teams IS NOT NULL AND user_teams != 'null'::jsonb;
  `);

  // 4. Composite indexes for common query patterns
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_test_reports_user_stored_at 
    ON test_reports (uploaded_by, stored_at DESC);
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_test_reports_tool_stored_at 
    ON test_reports (tool_name, stored_at DESC)
    WHERE tool_name IS NOT NULL;
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_test_reports_env_stored_at 
    ON test_reports (environment_test_environment, stored_at DESC)
    WHERE environment_test_environment IS NOT NULL;
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_test_reports_user_timestamp 
    ON test_reports (uploaded_by, timestamp DESC);
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_test_reports_tool_timestamp_v2 
    ON test_reports (tool_name, timestamp DESC)
    WHERE tool_name IS NOT NULL;
  `);

  // 5. Standard indexes for common filters and performance optimization
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_test_reports_recent_stored_at 
    ON test_reports (stored_at DESC);
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_test_reports_recent_timestamp 
    ON test_reports (timestamp DESC);
  `);

  // 6. Additional GIN indexes for JSONB fields
  pgm.createIndex('test_reports', 'test_data', {
    name: 'idx_test_reports_test_data_enhanced_gin',
    method: 'gin',
  });

  pgm.createIndex('test_reports', 'environment_data', {
    name: 'idx_test_reports_environment_data_enhanced_gin',
    method: 'gin',
  });

  // 7. Pagination and reporting optimization indexes
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_test_reports_pagination_v2 
    ON test_reports (stored_at DESC, report_id);
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_test_reports_failed_tests 
    ON test_reports (tool_name, summary_failed DESC, timestamp DESC)
    WHERE summary_failed > 0;
  `);

  // Log successful index creation
  pgm.sql(`
    DO $$
    BEGIN
      RAISE NOTICE 'Comprehensive performance indexes created successfully for test_reports table';
      RAISE NOTICE 'This migration consolidates indexes from both the script and previous migration';
    END
    $$;
  `);
};

exports.down = pgm => {
  // Drop all the indexes we created in this migration
  const indexes = [
    'idx_test_reports_uploaded_by_v2',
    'idx_test_reports_tool_name_v2',
    'idx_test_reports_environment_v2',
    'idx_test_reports_stored_at',
    'idx_test_reports_timestamp_v2',
    'idx_test_reports_user_teams_enhanced_gin',
    'idx_test_reports_user_stored_at',
    'idx_test_reports_tool_stored_at',
    'idx_test_reports_env_stored_at',
    'idx_test_reports_user_timestamp',
    'idx_test_reports_tool_timestamp_v2',
    'idx_test_reports_recent_stored_at',
    'idx_test_reports_recent_timestamp',
    'idx_test_reports_test_data_enhanced_gin',
    'idx_test_reports_environment_data_enhanced_gin',
    'idx_test_reports_pagination_v2',
    'idx_test_reports_failed_tests',
  ];

  indexes.forEach(indexName => {
    pgm.dropIndex('test_reports', indexName, { ifExists: true });
  });
};
