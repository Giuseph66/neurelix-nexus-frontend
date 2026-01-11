/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // Adicionar 'custom' ao enum app_role
  // Nota: PostgreSQL não permite IF NOT EXISTS em ALTER TYPE, então usamos um bloco DO
  pgm.sql(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'custom' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')) THEN
        ALTER TYPE public.app_role ADD VALUE 'custom';
      END IF;
    END $$;
  `);

  // Criar tabela custom_role_permissions
  pgm.createTable(
    { schema: 'public', name: 'custom_role_permissions' },
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
      role_name: {
        type: 'text',
        notNull: true,
      },
      permissions: {
        type: 'jsonb',
        notNull: true,
        default: '{}',
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

  // Constraint único: um role_name por projeto
  pgm.addConstraint(
    { schema: 'public', name: 'custom_role_permissions' },
    'custom_role_permissions_unique_project_role',
    {
      unique: ['project_id', 'role_name'],
    }
  );

  // Índices
  pgm.createIndex({ schema: 'public', name: 'custom_role_permissions' }, ['project_id']);
  pgm.createIndex({ schema: 'public', name: 'custom_role_permissions' }, ['project_id', 'role_name']);
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'public', name: 'custom_role_permissions' });
  // Nota: Não podemos remover um valor de enum facilmente, então deixamos 'custom' no enum
};

