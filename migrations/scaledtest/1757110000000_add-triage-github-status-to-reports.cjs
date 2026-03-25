/**
 * Add triage_github_status column to test_reports.
 * Allows reports to opt-in to posting triage summary as GitHub commit status.
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
  pgm.addColumns('test_reports', {
    triage_github_status: { type: 'boolean', notNull: true, default: false },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = pgm => {
  pgm.dropColumns('test_reports', ['triage_github_status']);
};
