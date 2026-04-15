-- Make invited_by nullable and set ON DELETE SET NULL so that deleting
-- a user who invited others does not violate the foreign key constraint.
-- Must drop the existing unnamed FK created by migration 000017 before
-- adding the new one with ON DELETE SET NULL; PostgreSQL does not allow
-- two FK constraints on the same column.
ALTER TABLE invitations
  DROP CONSTRAINT invitations_invited_by_fkey,
  ALTER COLUMN invited_by DROP NOT NULL,
  ADD CONSTRAINT fk_invitations_invited_by
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;