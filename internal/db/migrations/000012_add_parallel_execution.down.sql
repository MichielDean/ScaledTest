DROP TABLE IF EXISTS worker_executions;

ALTER TABLE test_executions
    DROP COLUMN IF EXISTS parallelism,
    DROP COLUMN IF EXISTS split_strategy,
    DROP COLUMN IF EXISTS test_files;
