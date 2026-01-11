/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    { schema: 'public', name: 'assistant_messages' },
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      user_id: {
        type: 'uuid',
        notNull: true,
        references: 'auth.users(id)',
        onDelete: 'CASCADE',
      },
      whiteboard_id: {
        type: 'uuid',
        notNull: true,
        references: 'public.whiteboards(id)',
        onDelete: 'CASCADE',
      },
      role: {
        type: 'text',
        notNull: true,
      },
      content: {
        type: 'text',
        notNull: true,
      },
      action: {
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
    { schema: 'public', name: 'assistant_messages' },
    'assistant_messages_role_check',
    {
      check: "role in ('user', 'assistant', 'system')",
    }
  );

  pgm.createIndex({ schema: 'public', name: 'assistant_messages' }, ['user_id', 'whiteboard_id', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'public', name: 'assistant_messages' }, { ifExists: true, cascade: true });
};
