exports.shorthands = undefined;

exports.up = pgm => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  pgm.createTable('test_executions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    status: { type: 'varchar(20)', notNull: true, default: "'queued'" },
    docker_image: { type: 'varchar(500)', notNull: true },
    test_command: { type: 'text', notNull: true },
    parallelism: { type: 'integer', notNull: true, default: 1 },
    environment_vars: { type: 'jsonb', default: "'{}'" },
    resource_limits: { type: 'jsonb', default: "'{}'" },
    requested_by: { type: 'varchar(255)' },
    team_id: { type: 'uuid' },
    started_at: { type: 'timestamptz' },
    completed_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    kubernetes_job_name: { type: 'varchar(255)' },
    kubernetes_namespace: { type: 'varchar(255)', default: "'scaledtest'" },
    error_message: { type: 'text' },
    total_pods: { type: 'integer', default: 0 },
    completed_pods: { type: 'integer', default: 0 },
    failed_pods: { type: 'integer', default: 0 },
  });

  // Add check constraint for valid status values
  pgm.addConstraint('test_executions', 'test_executions_status_check', {
    check: "status IN ('queued', 'running', 'completed', 'failed', 'cancelled')",
  });

  // Add check constraint for parallelism range
  pgm.addConstraint('test_executions', 'test_executions_parallelism_check', {
    check: 'parallelism >= 1 AND parallelism <= 50',
  });

  pgm.createIndex('test_executions', 'status');
  pgm.createIndex('test_executions', 'requested_by');
  pgm.createIndex('test_executions', 'team_id');
  pgm.createIndex('test_executions', 'created_at');
};

exports.down = pgm => {
  pgm.dropTable('test_executions');
};
