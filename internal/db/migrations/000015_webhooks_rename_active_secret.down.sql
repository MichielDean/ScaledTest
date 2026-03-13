ALTER TABLE webhooks RENAME COLUMN secret_hash TO secret;
ALTER TABLE webhooks RENAME COLUMN enabled TO active;
