/**
 * Better Auth Core Schema Migration
 * Target Database: auth
 * Run with: DATABASE_URL environment variable
 * 
 * This migration creates the core Better Auth tables in the auth database
 * Based on: https://www.better-auth.com/docs/concepts/database#core-schema
 */

exports.up = async (pgm) => {
  // Connect to auth database for schema creation
  // Note: This migration should be run with AUTH_DATABASE_URL pointing to the auth database
  
  // User table
  pgm.createTable('user', {
    id: { type: 'text', primaryKey: true },
    name: { type: 'text', notNull: true },
    email: { type: 'text', notNull: true, unique: true },
    emailVerified: { type: 'boolean', notNull: true, default: false },
    image: { type: 'text' },
    createdAt: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    updatedAt: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  // Session table
  pgm.createTable('session', {
    id: { type: 'text', primaryKey: true },
    expiresAt: { type: 'timestamp', notNull: true },
    token: { type: 'text', notNull: true, unique: true },
    createdAt: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    updatedAt: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    ipAddress: { type: 'text' },
    userAgent: { type: 'text' },
    userId: { 
      type: 'text', 
      notNull: true,
      references: '"user"(id)',
      onDelete: 'CASCADE'
    },
  });

  // Account table (for OAuth providers)
  pgm.createTable('account', {
    id: { type: 'text', primaryKey: true },
    accountId: { type: 'text', notNull: true },
    providerId: { type: 'text', notNull: true },
    userId: { 
      type: 'text', 
      notNull: true,
      references: '"user"(id)',
      onDelete: 'CASCADE'
    },
    accessToken: { type: 'text' },
    refreshToken: { type: 'text' },
    idToken: { type: 'text' },
    accessTokenExpiresAt: { type: 'timestamp' },
    refreshTokenExpiresAt: { type: 'timestamp' },
    scope: { type: 'text' },
    password: { type: 'text' },
    createdAt: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    updatedAt: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  // Verification table (for email verification, password reset, etc.)
  pgm.createTable('verification', {
    id: { type: 'text', primaryKey: true },
    identifier: { type: 'text', notNull: true },
    value: { type: 'text', notNull: true },
    expiresAt: { type: 'timestamp', notNull: true },
    createdAt: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    updatedAt: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  // Create indexes for better performance
  pgm.createIndex('user', 'email');
  pgm.createIndex('session', 'token');
  pgm.createIndex('session', 'userId');
  pgm.createIndex('account', ['providerId', 'accountId']);
  pgm.createIndex('account', 'userId');
  pgm.createIndex('verification', 'identifier');
  pgm.createIndex('verification', 'value');
};

exports.down = async (pgm) => {
  // Drop tables in reverse order to handle foreign key constraints
  pgm.dropTable('verification');
  pgm.dropTable('account');
  pgm.dropTable('session');
  pgm.dropTable('user');
};
