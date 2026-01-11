/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    { schema: 'public', name: 'local_pr_thread_resolutions' },
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
      thread_id: {
        type: 'text',
        notNull: true,
      },
      resolution: {
        type: 'text',
        notNull: true,
      },
      reason: {
        type: 'text',
        notNull: true,
      },
      resolved_by_user_id: {
        type: 'uuid',
        notNull: true,
        references: 'auth.users(id)',
        onDelete: 'CASCADE',
      },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('now()'),
      },
    }
  );

  pgm.addConstraint(
    { schema: 'public', name: 'local_pr_thread_resolutions' },
    'local_pr_thread_resolutions_resolution_check',
    {
      check: "resolution in ('RESOLVED', 'WONT_FIX')",
    }
  );

  // Um status por thread (atualiza por UPSERT)
  pgm.addConstraint(
    { schema: 'public', name: 'local_pr_thread_resolutions' },
    'local_pr_thread_resolutions_unique_thread',
    {
      unique: ['repo_id', 'pr_number', 'thread_id'],
    }
  );

  pgm.createIndex(
    { schema: 'public', name: 'local_pr_thread_resolutions' },
    ['project_id', 'repo_id', 'pr_number']
  );
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'public', name: 'local_pr_thread_resolutions' }, { ifExists: true, cascade: true });
};


