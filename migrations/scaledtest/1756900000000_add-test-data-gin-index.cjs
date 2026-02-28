exports.shorthands = undefined;

exports.up = pgm => {
  pgm.sql(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_test_reports_test_data_gin
    ON test_reports USING gin(test_data)
  `);
  pgm.sql(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_test_reports_failed
    ON test_reports (timestamp DESC)
    WHERE summary_failed > 0
  `);
};

exports.down = pgm => {
  pgm.sql('DROP INDEX IF EXISTS idx_test_reports_test_data_gin');
  pgm.sql('DROP INDEX IF EXISTS idx_test_reports_failed');
};
