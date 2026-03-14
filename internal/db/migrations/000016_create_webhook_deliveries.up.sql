CREATE TABLE webhook_deliveries (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id    UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    url           TEXT NOT NULL,
    event_type    TEXT NOT NULL,
    attempt       INT NOT NULL DEFAULT 1,
    status_code   INT,
    error         TEXT,
    duration_ms   INT NOT NULL DEFAULT 0,
    delivered_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries (webhook_id, delivered_at DESC);
