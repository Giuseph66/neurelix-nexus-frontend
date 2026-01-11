/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // Adicionar coluna custom_role_name em project_members
  pgm.addColumn(
    { schema: 'public', name: 'project_members' },
    {
      custom_role_name: {
        type: 'text',
        notNull: false,
        comment: 'Nome do role customizado quando role = custom. Referencia custom_role_permissions.role_name',
      },
    }
  );

  // Adicionar constraint: se role = 'custom', custom_role_name deve estar preenchido
  // (mas não podemos fazer isso diretamente, então faremos via trigger ou validação no backend)
  
  // Índice para busca rápida (sem WHERE clause para evitar problema com enum na mesma transação)
  // O índice ainda será útil para buscas por custom_role_name
  pgm.createIndex(
    { schema: 'public', name: 'project_members' },
    ['project_id', 'custom_role_name'],
    {
      name: 'project_members_custom_role_name_idx',
    }
  );
};

exports.down = (pgm) => {
  pgm.dropIndex(
    { schema: 'public', name: 'project_members' },
    'project_members_custom_role_name_idx'
  );
  pgm.dropColumn({ schema: 'public', name: 'project_members' }, 'custom_role_name');
};

