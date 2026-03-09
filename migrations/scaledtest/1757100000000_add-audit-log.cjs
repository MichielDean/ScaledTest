/**
 * Audit Log Migration
 * Target Database: scaledtest (TIMESCALE_DATABASE_URL)
 *
 * Creates an append-only audit_log table that records who did what and when.
 * Rows are never updated or deleted — this is the invariant that makes the log trustworthy.
 *
 * Action categories:
 *   - report.*      : test report operations (submitted, deleted)
 *   - execution.*   : execution lifecycle (created, cancelled, completed, failed)
 *   - admin.*       : admin operations (role_changed, user_deleted, user_invited)
 *   - team.*        : team membership changes (member_added, member_removed)
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = pgm => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  pgm.createTable('audit_log', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    // The user who performed the action (Better Auth user id or api-token:<tokenId>).
    // NULL if the action was performed by the system (e.g. a background job).
    actor_id: {
      type: 'varchar(255)',
      notNull: false,
    },
    actor_email: {
      // Denormalised for human readability in the audit view; not relied on for auth.
      type: 'varchar(320)',
      notNull: false,
    },
    // Category.verb — e.g. "execution.created", "admin.role_changed", "report.submitted"
    action: {
      type: 'varchar(100)',
      notNull: true,
    },
    // The primary resource being acted on (e.g. execution id, report id, user id).
    resource_type: {
      type: 'varchar(100)',
      notNull: true,
    },
    resource_id: {
      type: 'varchar(255)',
      notNull: false,
    },
    // Optional team scope.  NULL if the action is not team-scoped.
    team_id: {
      type: 'uuid',
      notNull: false,
    },
    // Arbitrary structured context — kept as JSONB so callers can attach
    // whatever is relevant without schema churn.
    metadata: {
      type: 'jsonb',
      notNull: false,
      default: '{}',
    },
    // HTTP request IP, useful for security audits.
    ip_address: {
      type: 'varchar(45)', // IPv6 max length
      notNull: false,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // The most common query: recent actions, newest first.
  pgm.createIndex('audit_log', 'created_at');
  // Filter by actor.
  pgm.createIndex('audit_log', 'actor_id');
  // Filter by action category (prefix/category filtering via starts_with(), e.g. 'execution.*').
  pgm.createIndex('audit_log', 'action');
  // Filter by resource.
  pgm.createIndex('audit_log', ['resource_type', 'resource_id']);
  // Filter by team.
  pgm.createIndex('audit_log', 'team_id');

  // Revoke UPDATE and DELETE on audit_log so no application code can mutate rows.
  // INSERT and SELECT remain (granted implicitly via the owning role in production).
  // In test / local environments the owning role may not differ, but the intent is clear.
  pgm.sql(`
    REVOKE UPDATE, DELETE ON TABLE audit_log FROM PUBLIC;
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = pgm => {
  pgm.dropTable('audit_log');
};
