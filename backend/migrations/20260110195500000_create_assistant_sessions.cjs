/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    { schema: 'public', name: 'assistant_sessions' },
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
      title: {
        type: 'text',
        notNull: true,
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

  pgm.createIndex({ schema: 'public', name: 'assistant_sessions' }, ['user_id', 'whiteboard_id', 'updated_at']);

  pgm.addColumn(
    { schema: 'public', name: 'assistant_messages' },
    {
      session_id: {
        type: 'uuid',
        references: 'public.assistant_sessions(id)',
        onDelete: 'CASCADE',
      },
    }
  );

  pgm.sql(`
    INSERT INTO public.assistant_sessions (id, user_id, whiteboard_id, title, created_at, updated_at)
    SELECT gen_random_uuid(), user_id, whiteboard_id, 'Sessão 1', MIN(created_at), MAX(created_at)
    FROM public.assistant_messages
    GROUP BY user_id, whiteboard_id
  `);

  pgm.sql(`
    UPDATE public.assistant_messages m
    SET session_id = s.id
    FROM public.assistant_sessions s
    WHERE m.user_id = s.user_id
      AND m.whiteboard_id = s.whiteboard_id
      AND m.session_id IS NULL
  `);

  pgm.alterColumn(
    { schema: 'public', name: 'assistant_messages' },
    'session_id',
    { notNull: true }
  );

  pgm.createIndex({ schema: 'public', name: 'assistant_messages' }, ['session_id', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropIndex({ schema: 'public', name: 'assistant_messages' }, ['session_id', 'created_at']);
  pgm.dropColumn({ schema: 'public', name: 'assistant_messages' }, 'session_id');
  pgm.dropTable({ schema: 'public', name: 'assistant_sessions' }, { ifExists: true, cascade: true });
};
