exports.shorthands = undefined;

exports.up = pgm => {
  pgm.addColumns('test_reports', {
    execution_id: { type: 'uuid', references: 'test_executions(id)', onDelete: 'SET NULL' },
  });
  pgm.createIndex('test_reports', 'execution_id');
};

exports.down = pgm => {
  pgm.dropIndex('test_reports', 'execution_id');
  pgm.dropColumns('test_reports', ['execution_id']);
};
