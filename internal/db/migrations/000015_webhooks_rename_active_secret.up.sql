ALTER TABLE webhooks RENAME COLUMN active TO enabled;
ALTER TABLE webhooks RENAME COLUMN secret TO secret_hash;
