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
      // Normalised (lowercased) email address of the person being invited
      type: 'varchar(255)',
      notNull: true,
    },
    role: {
      // Role to assign on acceptance
      type: 'varchar(50)',
      notNull: true,
      // DB-level guard — application validation is NOT a substitute
      check: "role IN ('readonly', 'maintainer', 'owner')",
    },
    token_hash: {
      // SHA-256 hex digest of the raw invitation token — NEVER store the raw value.
      // unique: true also creates the covering index; no separate createIndex needed.
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
      // Better Auth user ID of the person who sent the invitation.
      // varchar(255) to match Better Auth's user.id type; no FK because Better Auth
      // manages its users table and we don't want a hard DB dependency on it.
      // Orphan records (inviter deleted) are acceptable — the invitation remains readable.
      type: 'varchar(255)',
      notNull: true,
    },
    team_id: {
      // Optional: scope the invitation to a specific team.
      // SET NULL on team deletion — acceptance flow must handle null team_id gracefully.
      type: 'uuid',
      references: 'teams(id)',
      onDelete: 'SET NULL',
    },
    expires_at: {
      // When the invitation link expires (default: 3 days from creation, max: 7 days).
      type: 'timestamptz',
      notNull: true,
    },
    accepted_at: {
      // Set atomically when the invitee completes registration — makes token permanently invalid.
      type: 'timestamptz',
    },
    revoked_at: {
      // Set when an admin revokes the invitation — makes token permanently invalid.
      type: 'timestamptz',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // Sanity constraints — enforce invariants the application also checks.
  pgm.sql(`
    ALTER TABLE invitations
      ADD CONSTRAINT invitations_expires_after_created
        CHECK (expires_at > created_at),
      ADD CONSTRAINT invitations_accepted_xor_revoked
        CHECK (NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL))
  `);

  // NOTE: token_hash already has a covering unique index from unique: true above.
  // Do NOT add another createIndex — that would create a duplicate bloating every write.

  // Active invitations per email+team: prevent duplicate active invites.
  // Partial (pending only) so accepted/revoked records don't interfere.
  pgm.sql(`
    CREATE UNIQUE INDEX invitations_active_per_email_team
      ON invitations (email, COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid))
     WHERE accepted_at IS NULL AND revoked_at IS NULL
  `);

  // Support listing by team, inviter, and email.
  pgm.createIndex('invitations', 'team_id');
  pgm.createIndex('invitations', 'invited_by_user_id');
  pgm.createIndex('invitations', 'email');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = pgm => {
  pgm.dropTable('invitations');
};
