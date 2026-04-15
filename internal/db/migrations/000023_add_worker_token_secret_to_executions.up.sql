-- Store the actual K8s Secret name used for the worker token so that
-- cancellation and reconciliation can clean up only auto-created secrets.
ALTER TABLE test_executions
    ADD COLUMN worker_token_secret TEXT;