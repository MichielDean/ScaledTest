/**
 * API Tokens Migration
 * Target Database: scaledtest (TIMESCALE_DATABASE_URL)
 *
 * Creates the api_tokens table for long-lived headless authentication
 * tokens scoped to a team, intended for CI pipelines and worker pods.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = pgm => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  pgm.createTable('api_tokens', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    name: {
      // Human-readable label set by the token creator
      type: 'varchar(255)',
      notNull: true,
    },
    token_hash: {
      // SHA-256 hex digest of the raw token — never store the raw value
      type: 'char(64)',
      notNull: true,
      unique: true,
    },
    token_prefix: {
      // First ~12 characters of the raw token for display/identification
      type: 'varchar(20)',
      notNull: true,
    },
    team_id: {
      type: 'uuid',
      notNull: true,
      references: 'teams(id)',
      onDelete: 'CASCADE',
    },
    created_by_user_id: {
      // The Better Auth user ID of the person who created this token
      type: 'varchar(255)',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    last_used_at: {
      type: 'timestamptz',
    },
    expires_at: {
      // NULL means the token never expires
      type: 'timestamptz',
    },
  });

  // Look up a token by its hash on every authenticated request
  pgm.createIndex('api_tokens', 'token_hash');
  // List all tokens for a team
  pgm.createIndex('api_tokens', 'team_id');
  // Find tokens created by a specific user
  pgm.createIndex('api_tokens', 'created_by_user_id');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = pgm => {
  pgm.dropTable('api_tokens');
};
