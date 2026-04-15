-- Revert: make invited_by NOT NULL again and remove the FK with SET NULL.
ALTER TABLE invitations
  DROP CONSTRAINT IF EXISTS fk_invitations_invited_by,
  ALTER COLUMN invited_by SET NOT NULL;