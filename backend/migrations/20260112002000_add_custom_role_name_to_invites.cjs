/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // Adicionar coluna custom_role_name em project_invites
  pgm.addColumn(
    { schema: 'public', name: 'project_invites' },
    {
      custom_role_name: {
        type: 'text',
        notNull: false,
        comment: 'Nome do role customizado quando role = custom. Referencia custom_role_permissions.role_name',
      },
    }
  );

  // Índice para busca rápida
  pgm.createIndex(
    { schema: 'public', name: 'project_invites' },
    ['project_id', 'custom_role_name'],
    {
      name: 'project_invites_custom_role_name_idx',
    }
  );
};

exports.down = (pgm) => {
  pgm.dropIndex(
    { schema: 'public', name: 'project_invites' },
    'project_invites_custom_role_name_idx'
  );
  pgm.dropColumn({ schema: 'public', name: 'project_invites' }, 'custom_role_name');
};

