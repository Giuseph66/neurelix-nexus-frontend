import type { FastifyInstance } from 'fastify';
import type { Permission, AppRole, RolePermissions } from '../types/permissions.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../types/permissions.js';

/**
 * Obtém o role de um usuário em um projeto
 */
export async function getProjectRole(
  app: FastifyInstance,
  projectId: string,
  userId: string
): Promise<{ role: AppRole; customRoleName?: string | null } | null> {
  // Verificar se é o criador do projeto (admin automático)
  const creatorResult = await app.db.query<{ created_by: string | null }>(
    'SELECT created_by FROM public.projects WHERE id = $1',
    [projectId]
  );
  if (creatorResult.rows[0]?.created_by === userId) {
    return { role: 'admin' };
  }

  // Buscar role do membro
  const memberResult = await app.db.query<{ role: AppRole; custom_role_name: string | null }>(
    'SELECT role, custom_role_name FROM public.project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, userId]
  );

  if (memberResult.rows.length === 0) {
    return null;
  }

  const member = memberResult.rows[0];
  return {
    role: member.role,
    customRoleName: member.custom_role_name,
  };
}

/**
 * Verifica se um usuário tem uma permissão específica
 */
export async function hasPermission(
  app: FastifyInstance,
  projectId: string,
  userId: string,
  permission: Permission
): Promise<boolean> {
  const userRole = await getProjectRole(app, projectId, userId);
  
  if (!userRole) {
    return false;
  }

  const { role, customRoleName } = userRole;

  // Admin tem todas as permissões
  if (role === 'admin') {
    return true;
  }

  // Para roles padrão, verificar permissões pré-configuradas
  if (role !== 'custom') {
    const rolePermissions = DEFAULT_ROLE_PERMISSIONS[role];
    return rolePermissions[permission] === true;
  }

  // Para role customizado, buscar permissões do banco de dados
  if (role === 'custom' && customRoleName) {
    const customRoleResult = await app.db.query<{ permissions: RolePermissions }>(
      'SELECT permissions FROM public.custom_role_permissions WHERE project_id = $1 AND role_name = $2',
      [projectId, customRoleName]
    );

    if (customRoleResult.rows.length === 0) {
      return false; // Role customizado não encontrado
    }

    const customPermissions = customRoleResult.rows[0].permissions;
    return customPermissions[permission] === true;
  }

  return false;
}

