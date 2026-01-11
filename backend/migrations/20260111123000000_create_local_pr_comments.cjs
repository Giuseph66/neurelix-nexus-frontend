/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    { schema: 'public', name: 'local_pr_comments' },
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
      comment_type: {
        type: 'text',
        notNull: true,
      },
      thread_id: {
        type: 'text',
        notNull: true,
      },
      in_reply_to_id: {
        type: 'text',
      },
      path: {
        type: 'text',
      },
      line_number: {
        type: 'int',
      },
      side: {
        type: 'text',
      },
      body: {
        type: 'text',
        notNull: true,
      },
      author_user_id: {
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
    { schema: 'public', name: 'local_pr_comments' },
    'local_pr_comments_type_check',
    {
      check: "comment_type in ('general', 'inline')",
    }
  );

  pgm.addConstraint(
    { schema: 'public', name: 'local_pr_comments' },
    'local_pr_comments_side_check',
    {
      check: "side is null or side in ('LEFT', 'RIGHT')",
    }
  );

  pgm.createIndex(
    { schema: 'public', name: 'local_pr_comments' },
    ['project_id', 'repo_id', 'pr_number', 'comment_type', 'created_at']
  );
  pgm.createIndex(
    { schema: 'public', name: 'local_pr_comments' },
    ['repo_id', 'pr_number', 'thread_id']
  );
  pgm.createIndex(
    { schema: 'public', name: 'local_pr_comments' },
    ['repo_id', 'pr_number', 'path', 'line_number']
  );
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'public', name: 'local_pr_comments' }, { ifExists: true, cascade: true });
};


