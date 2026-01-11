/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    { schema: 'public', name: 'local_pr_reviews' },
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      project_id: {
        type: 'uuid',
        notNull: true,
        references: 'public.projects(id)',
        onDelete: 'CASCADE',
      },
      repo_id: {
        type: 'uuid',
        notNull: true,
        references: 'public.repos(id)',
        onDelete: 'CASCADE',
      },
      pr_number: {
        type: 'int',
        notNull: true,
      },
      reviewer_user_id: {
        type: 'uuid',
        notNull: true,
        references: 'auth.users(id)',
        onDelete: 'CASCADE',
      },
      state: {
        type: 'text',
        notNull: true,
      },
      body: {
        type: 'text',
      },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('now()'),
      },
    }
  );

  pgm.addConstraint(
    { schema: 'public', name: 'local_pr_reviews' },
    'local_pr_reviews_state_check',
    {
      check: "state in ('APPROVED', 'CHANGES_REQUESTED', 'COMMENTED')",
    }
  );

  // Um review por usuário por PR (último estado vence via UPSERT no endpoint)
  pgm.addConstraint(
    { schema: 'public', name: 'local_pr_reviews' },
    'local_pr_reviews_unique_reviewer_per_pr',
    {
      unique: ['repo_id', 'pr_number', 'reviewer_user_id'],
    }
  );

  pgm.createIndex(
    { schema: 'public', name: 'local_pr_reviews' },
    ['project_id', 'repo_id', 'pr_number', 'created_at']
  );
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'public', name: 'local_pr_reviews' }, { ifExists: true, cascade: true });
};


