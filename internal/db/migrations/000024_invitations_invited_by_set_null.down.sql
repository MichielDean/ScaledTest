-- Revert: make invited_by NOT NULL again and remove the FK with SET NULL.
-- Any rows where invited_by was set to NULL by ON DELETE SET NULL must be
-- updated to a sentinel UUID before we can re-add NOT NULL, otherwise the
-- constraint would fail. Since there is no meaningful sentinel user, this
-- migration is intentionally NOT reversible — once deployed, invitations
-- may have invited_by = NULL, and rolling back would silently corrupt data.
-- Do not use this down migration; deploy a new migration instead if reversibility
-- is required.
SELECT 1;