/**
 * Invitations Migration
 * Target Database: scaledtest (TIMESCALE_DATABASE_URL)
 *
 * Creates the invitations table for the user invitation flow.
 * Invitations are single-use signed links: the raw token is emailed to the
 * invitee; only its SHA-256 hash is stored. On acceptance, the user account
 * is created, the assigned role applied, and the invitation marked accepted.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = pgm => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  pgm.createTable('invitations', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    email: {
      // Email address of the person being invited
      type: 'varchar(255)',
      notNull: true,
    },
    role: {
      // Role to assign on acceptance: readonly | maintainer | owner
      type: 'varchar(50)',
      notNull: true,
    },
    token_hash: {
      // SHA-256 hex digest of the raw invitation token — never store the raw value
      type: 'char(64)',
      notNull: true,
      unique: true,
    },
    token_prefix: {
      // First ~16 characters of the raw token for display/identification (not secret)
      type: 'varchar(20)',
      notNull: true,
    },
    invited_by_user_id: {
      // Better Auth user ID of the person who sent the invitation
      type: 'varchar(255)',
      notNull: true,
    },
    team_id: {
      // Optional: scope the invitation to a specific team
      type: 'uuid',
      references: 'teams(id)',
      onDelete: 'SET NULL',
    },
    expires_at: {
      // When the invitation link expires (typically 7 days after creation)
      type: 'timestamptz',
      notNull: true,
    },
    accepted_at: {
      // Set when the invitee completes registration — makes token permanently invalid
      type: 'timestamptz',
    },
    revoked_at: {
      // Set when an admin revokes the invitation — makes token permanently invalid
      type: 'timestamptz',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // Primary lookup: validate an incoming token on every accept/preview request
  pgm.createIndex('invitations', 'token_hash');
  // List invitations scoped to a team
  pgm.createIndex('invitations', 'team_id');
  // List invitations sent by a specific user
  pgm.createIndex('invitations', 'invited_by_user_id');
  // Filter by email (check for existing pending invites)
  pgm.createIndex('invitations', 'email');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = pgm => {
  pgm.dropTable('invitations');
};
