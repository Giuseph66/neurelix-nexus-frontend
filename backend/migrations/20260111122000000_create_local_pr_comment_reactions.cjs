/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    { schema: 'public', name: 'local_pr_comment_reactions' },
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
      comment_id: {
        type: 'text',
        notNull: true,
      },
      user_id: {
        type: 'uuid',
        notNull: true,
        references: 'auth.users(id)',
        onDelete: 'CASCADE',
      },
      reaction: {
        type: 'text',
        notNull: true,
      },
      reason: {
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
    { schema: 'public', name: 'local_pr_comment_reactions' },
    'local_pr_comment_reactions_reaction_check',
    {
      check: "reaction in ('like', 'dislike', 'contra')",
    }
  );

  pgm.addConstraint(
    { schema: 'public', name: 'local_pr_comment_reactions' },
    'local_pr_comment_reactions_unique_user_comment',
    {
      unique: ['repo_id', 'pr_number', 'comment_id', 'user_id'],
    }
  );

  pgm.createIndex(
    { schema: 'public', name: 'local_pr_comment_reactions' },
    ['project_id', 'repo_id', 'pr_number', 'comment_id']
  );
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'public', name: 'local_pr_comment_reactions' }, { ifExists: true, cascade: true });
};


