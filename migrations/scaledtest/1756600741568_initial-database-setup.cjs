/**
 * ScaledTest Database Migration - Test Reports Schema
 * Target Database: scaledtest
 * Run with: TIMESCALE_DATABASE_URL environment variable
 * 
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = pgm => {
  // Debug: Check what database we're connected to
  pgm.sql("SELECT current_database() as connected_db");
  
  // Debug: Check if TimescaleDB functions are available
  pgm.sql("SELECT 'TimescaleDB functions available' as status FROM pg_proc WHERE proname = 'create_hypertable'");
  
  // Ensure TimescaleDB extension is available (should be created by init script)
  pgm.sql("CREATE EXTENSION IF NOT EXISTS timescaledb");

  // Create the test_reports table
  pgm.createTable('test_reports', {
    report_id: { type: 'varchar(255)', notNull: true },
    report_format: { type: 'varchar(50)', default: 'CTRF' },
    spec_version: { type: 'varchar(50)', default: '1.0.0' },
    timestamp: { type: 'timestamptz', notNull: true },
    stored_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    generated_by: { type: 'varchar(255)' },
    tool_name: { type: 'varchar(255)' },
    tool_version: { type: 'varchar(100)' },
    tool_url: { type: 'text' },
    summary_tests: { type: 'integer', default: 0 },
    summary_passed: { type: 'integer', default: 0 },
    summary_failed: { type: 'integer', default: 0 },
    summary_skipped: { type: 'integer', default: 0 },
    summary_pending: { type: 'integer', default: 0 },
    summary_other: { type: 'integer', default: 0 },
    summary_start: { type: 'timestamptz' },
    summary_stop: { type: 'timestamptz' },
    environment_app_name: { type: 'varchar(255)' },
    environment_app_version: { type: 'varchar(100)' },
    environment_build_name: { type: 'varchar(255)' },
    environment_build_number: { type: 'varchar(100)' },
    environment_branch_name: { type: 'varchar(255)' },
    environment_test_environment: { type: 'varchar(100)' },
    uploaded_by: { type: 'varchar(255)' },
    user_teams: { type: 'jsonb' },
    test_data: { type: 'jsonb' },
    environment_data: { type: 'jsonb' },
    extra_data: { type: 'jsonb' },
  });

  // Add primary key constraint
  pgm.addConstraint('test_reports', 'test_reports_pkey', {
    primaryKey: ['report_id', 'timestamp'],
  });

  // Convert to TimescaleDB hypertable
  // Using the simplest function signature that works
  pgm.sql("SELECT create_hypertable('test_reports', 'timestamp')");

  // Create basic indexes for performance
  pgm.createIndex('test_reports', 'uploaded_by');
  pgm.createIndex('test_reports', 'tool_name');
  pgm.createIndex('test_reports', 'environment_test_environment');
  pgm.createIndex('test_reports', 'user_teams', { method: 'gin' });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = pgm => {
  pgm.dropTable('test_reports');
};
