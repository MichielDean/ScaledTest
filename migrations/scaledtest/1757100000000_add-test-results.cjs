/**
 * Normalized test_results table — extracts individual test name/status/duration
 * from CTRF reports, making flaky detection and analytics indexable.
 * Target Database: scaledtest
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = pgm => {
  pgm.createTable('test_results', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    report_id: { type: 'varchar(255)', notNull: true },
    report_timestamp: { type: 'timestamptz', notNull: true },
    uploaded_by: { type: 'varchar(255)' },
    user_teams: { type: 'jsonb' },
    name: { type: 'text', notNull: true },
    status: { type: 'varchar(20)', notNull: true },
    duration_ms: { type: 'bigint', notNull: true, default: 0 },
    suite: { type: 'text' },
    message: { type: 'text' },
    file_path: { type: 'text' },
    retries: { type: 'integer', notNull: true, default: 0 },
    flaky: { type: 'boolean', notNull: true, default: false },
    tags: { type: 'text[]' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Convert to TimescaleDB hypertable partitioned by created_at
  pgm.sql("SELECT create_hypertable('test_results', 'created_at', migrate_data => true, if_not_exists => true)");

  // Indexes for analytics queries
  pgm.createIndex('test_results', 'report_id');
  pgm.createIndex('test_results', 'name');
  pgm.createIndex('test_results', 'status');
  pgm.createIndex('test_results', 'created_at', { method: 'btree' });
  pgm.createIndex('test_results', 'uploaded_by');
  pgm.createIndex('test_results', 'user_teams', { method: 'gin' });

  // Composite index for flaky test detection: name + status within time range
  pgm.createIndex('test_results', ['name', 'suite', 'created_at'], { name: 'idx_test_results_flaky_detection' });

  // Backfill from existing test_reports — extract tests from test_data JSONB
  pgm.sql(`
    INSERT INTO test_results (report_id, report_timestamp, uploaded_by, user_teams, name, status, duration_ms, suite, message, file_path, retries, flaky, tags, created_at)
    SELECT
      r.report_id,
      r.timestamp,
      r.uploaded_by,
      r.user_teams,
      t->>'name',
      COALESCE(t->>'status', 'other'),
      COALESCE((t->>'duration')::bigint, 0),
      t->>'suite',
      t->>'message',
      t->>'filePath',
      COALESCE((t->>'retries')::integer, 0),
      COALESCE((t->>'flaky')::boolean, false),
      CASE
        WHEN t->'tags' IS NOT NULL AND jsonb_typeof(t->'tags') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(t->'tags'))
        ELSE NULL
      END,
      r.timestamp
    FROM test_reports r,
      jsonb_array_elements(r.test_data->'tests') AS t
    WHERE t->>'name' IS NOT NULL
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = pgm => {
  pgm.dropTable('test_results');
};
