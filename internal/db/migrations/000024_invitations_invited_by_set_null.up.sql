-- Make invited_by nullable and set ON DELETE SET NULL so that deleting
-- a user who invited others does not violate the foreign key constraint.
ALTER TABLE invitations
  ALTER COLUMN invited_by DROP NOT NULL,
  ADD CONSTRAINT fk_invitations_invited_by
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;