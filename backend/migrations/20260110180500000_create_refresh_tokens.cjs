/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createSchema('auth', { ifNotExists: true });

  pgm.createTable(
    { schema: 'auth', name: 'refresh_tokens' },
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
      token_hash: {
        type: 'text',
        notNull: true,
        unique: true,
      },
      expires_at: {
        type: 'timestamptz',
        notNull: true,
      },
      revoked_at: {
        type: 'timestamptz',
      },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('now()'),
      },
      created_ip: {
        type: 'text',
      },
      user_agent: {
        type: 'text',
      },
    }
  );

  pgm.createIndex({ schema: 'auth', name: 'refresh_tokens' }, 'user_id');
  pgm.createIndex(
    { schema: 'auth', name: 'refresh_tokens' },
    ['token_hash'],
    { unique: true }
  );
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'auth', name: 'refresh_tokens' }, { ifExists: true, cascade: true });
};
