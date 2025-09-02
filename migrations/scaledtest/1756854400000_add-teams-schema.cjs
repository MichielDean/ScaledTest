/**
 * Teams Schema Migration
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
  // Ensure UUID extension is available
  pgm.sql("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"");

  // Create teams table
  pgm.createTable('teams', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    name: { type: 'varchar(100)', notNull: true, unique: true },
    description: { type: 'text' },
    is_default: { type: 'boolean', notNull: true, default: false },
    created_by: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Create user_teams junction table for many-to-many relationship
  pgm.createTable('user_teams', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    user_id: { type: 'varchar(255)', notNull: true },
    team_id: { type: 'uuid', notNull: true, references: 'teams(id)', onDelete: 'CASCADE' },
    assigned_by: { type: 'varchar(255)', notNull: true },
    assigned_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Create indexes for performance
  pgm.createIndex('teams', 'name');
  pgm.createIndex('teams', 'created_by');
  pgm.createIndex('teams', 'is_default');
  pgm.createIndex('user_teams', 'user_id');
  pgm.createIndex('user_teams', 'team_id');
  pgm.createIndex('user_teams', ['user_id', 'team_id'], { unique: true });

  // Create a default team with a specific UUID
  pgm.sql(`
    INSERT INTO teams (id, name, description, is_default, created_by)
    VALUES (
      '00000000-0000-0000-0000-000000000001'::uuid,
      'Default Team',
      'Default team for all users',
      true,
      'system'
    )
  `);

  // Add trigger to automatically update updated_at timestamp
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  pgm.sql(`
    CREATE TRIGGER update_teams_updated_at 
    BEFORE UPDATE ON teams 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = pgm => {
  // Drop triggers and functions first
  pgm.sql('DROP TRIGGER IF EXISTS update_teams_updated_at ON teams');
  pgm.sql('DROP FUNCTION IF EXISTS update_updated_at_column()');
  
  // Drop tables
  pgm.dropTable('user_teams');
  pgm.dropTable('teams');
};
