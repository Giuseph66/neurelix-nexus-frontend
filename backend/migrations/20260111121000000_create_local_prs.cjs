/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    { schema: 'public', name: 'local_prs' },
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
      author_username: {
        type: 'text',
      },
      owner_user_id: {
        type: 'uuid',
        references: 'auth.users(id)',
        onDelete: 'SET NULL',
      },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('now()'),
      },
      updated_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('now()'),
      },
    }
  );

  pgm.addConstraint(
    { schema: 'public', name: 'local_prs' },
    'local_prs_unique_repo_pr',
    {
      unique: ['repo_id', 'pr_number'],
    }
  );

  pgm.createIndex({ schema: 'public', name: 'local_prs' }, ['project_id', 'repo_id', 'pr_number']);
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'public', name: 'local_prs' }, { ifExists: true, cascade: true });
};


