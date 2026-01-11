export type AppRole = 'admin' | 'tech_lead' | 'developer' | 'viewer' | 'custom';

/**
 * Retorna o label traduzido de um role
 */
export function getRoleLabel(role: string): string {
  switch (role) {
    case 'admin':
      return 'Administrador';
    case 'tech_lead':
      return 'Líder Técnico';
    case 'developer':
      return 'Desenvolvedor';
    case 'viewer':
      return 'Visualizador';
    case 'custom':
      return 'Personalizado';
    default:
      return role;
  }
}

/**
 * Retorna a descrição de um role
 */
export function getRoleDescription(role: AppRole): string {
  switch (role) {
    case 'admin':
      return 'Acesso total ao projeto, incluindo configurações e exclusão';
    case 'tech_lead':
      return 'Pode gerenciar equipe e código, mas não pode deletar o projeto';
    case 'developer':
      return 'Pode criar e editar tarefas, revisar código, mas não pode gerenciar equipe';
    case 'viewer':
      return 'Apenas visualização, sem permissões de edição';
    case 'custom':
      return 'Permissões configuradas manualmente';
    default:
      return '';
  }
}

/**
 * Retorna a variante do badge para um role
 */
export function getRoleBadgeVariant(role: AppRole): 'default' | 'secondary' | 'outline' {
  switch (role) {
    case 'admin':
      return 'default';
    case 'tech_lead':
      return 'secondary';
    case 'developer':
      return 'outline';
    case 'viewer':
      return 'outline';
    case 'custom':
      return 'secondary';
    default:
      return 'outline';
  }
}

