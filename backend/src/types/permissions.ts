export type PermissionModule = 'dashboard' | 'whiteboard' | 'tarefas' | 'code' | 'team' | 'settings';

export type PermissionAction = 
  // Dashboard
  | 'visualizar'
  // Whiteboard
  | 'visualizar' | 'criar' | 'editar' | 'deletar' | 'comentar'
  // Tarefas
  | 'visualizar' | 'criar' | 'editar' | 'deletar' | 'mover' | 'comentar' | 'gerenciar_sprints' | 'gerenciar_epics'
  // Code
  | 'visualizar' | 'conectar_github' | 'criar_pr' | 'revisar_pr' | 'mesclar_pr' | 'comentar_pr'
  // Team
  | 'visualizar' | 'convidar' | 'editar_roles' | 'remover_membros'
  // Settings
  | 'visualizar' | 'editar_projeto' | 'deletar_projeto';

export type Permission = `${PermissionModule}.${string}`;

export interface RolePermissions {
  [key: Permission]: boolean;
}

export type AppRole = 'admin' | 'tech_lead' | 'developer' | 'viewer' | 'custom';

// Permissões pré-configuradas para cada role padrão
export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, RolePermissions> = {
  admin: {
    // Admin tem todas as permissões
    'dashboard.visualizar': true,
    'whiteboard.visualizar': true,
    'whiteboard.criar': true,
    'whiteboard.editar': true,
    'whiteboard.deletar': true,
    'whiteboard.comentar': true,
    'tarefas.visualizar': true,
    'tarefas.criar': true,
    'tarefas.editar': true,
    'tarefas.deletar': true,
    'tarefas.mover': true,
    'tarefas.comentar': true,
    'tarefas.gerenciar_sprints': true,
    'tarefas.gerenciar_epics': true,
    'code.visualizar': true,
    'code.conectar_github': true,
    'code.criar_pr': true,
    'code.revisar_pr': true,
    'code.mesclar_pr': true,
    'code.comentar_pr': true,
    'team.visualizar': true,
    'team.convidar': true,
    'team.editar_roles': true,
    'team.remover_membros': true,
    'settings.visualizar': true,
    'settings.editar_projeto': true,
    'settings.deletar_projeto': true,
  },
  tech_lead: {
    'dashboard.visualizar': true,
    'whiteboard.visualizar': true,
    'whiteboard.criar': true,
    'whiteboard.editar': true,
    'whiteboard.deletar': true,
    'whiteboard.comentar': true,
    'tarefas.visualizar': true,
    'tarefas.criar': true,
    'tarefas.editar': true,
    'tarefas.deletar': true,
    'tarefas.mover': true,
    'tarefas.comentar': true,
    'tarefas.gerenciar_sprints': true,
    'tarefas.gerenciar_epics': true,
    'code.visualizar': true,
    'code.conectar_github': true,
    'code.criar_pr': true,
    'code.revisar_pr': true,
    'code.mesclar_pr': true,
    'code.comentar_pr': true,
    'team.visualizar': true,
    'team.convidar': true,
    'team.editar_roles': true,
    'team.remover_membros': true,
    'settings.visualizar': true,
    'settings.editar_projeto': true,
    'settings.deletar_projeto': false, // Tech lead não pode deletar projeto
  },
  developer: {
    'dashboard.visualizar': true,
    'whiteboard.visualizar': true,
    'whiteboard.criar': true,
    'whiteboard.editar': true,
    'whiteboard.deletar': false,
    'whiteboard.comentar': true,
    'tarefas.visualizar': true,
    'tarefas.criar': true,
    'tarefas.editar': true,
    'tarefas.deletar': false,
    'tarefas.mover': true,
    'tarefas.comentar': true,
    'tarefas.gerenciar_sprints': false,
    'tarefas.gerenciar_epics': false,
    'code.visualizar': true,
    'code.conectar_github': false,
    'code.criar_pr': true,
    'code.revisar_pr': true,
    'code.mesclar_pr': false,
    'code.comentar_pr': true,
    'team.visualizar': true,
    'team.convidar': false,
    'team.editar_roles': false,
    'team.remover_membros': false,
    'settings.visualizar': true,
    'settings.editar_projeto': false,
    'settings.deletar_projeto': false,
  },
  viewer: {
    'dashboard.visualizar': true,
    'whiteboard.visualizar': true,
    'whiteboard.criar': false,
    'whiteboard.editar': false,
    'whiteboard.deletar': false,
    'whiteboard.comentar': false,
    'tarefas.visualizar': true,
    'tarefas.criar': false,
    'tarefas.editar': false,
    'tarefas.deletar': false,
    'tarefas.mover': false,
    'tarefas.comentar': false,
    'tarefas.gerenciar_sprints': false,
    'tarefas.gerenciar_epics': false,
    'code.visualizar': true,
    'code.conectar_github': false,
    'code.criar_pr': false,
    'code.revisar_pr': false,
    'code.mesclar_pr': false,
    'code.comentar_pr': false,
    'team.visualizar': true,
    'team.convidar': false,
    'team.editar_roles': false,
    'team.remover_membros': false,
    'settings.visualizar': false,
    'settings.editar_projeto': false,
    'settings.deletar_projeto': false,
  },
  custom: {
    // Permissões customizadas são carregadas do banco de dados
    // Este objeto serve apenas como placeholder
  },
};

