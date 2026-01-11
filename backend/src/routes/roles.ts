import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { RolePermissions } from '../types/permissions.js';
import { getProjectRole } from '../utils/permissions.js';

export async function roleRoutes(app: FastifyInstance) {
  // GET /projects/:projectId/roles - Listar todos os roles customizados do projeto
  app.get(
    '/projects/:projectId/roles',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
      const projectId = (req.params as any).projectId as string;

      // Verificar se usuário tem permissão para ver roles (admin ou tech_lead)
      const userRole = await getProjectRole(app, projectId, userId);
      if (!userRole || (userRole.role !== 'admin' && userRole.role !== 'tech_lead')) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const { rows } = await app.db.query<{
        id: string;
        role_name: string;
        permissions: RolePermissions;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, role_name, permissions, created_at, updated_at
         FROM public.custom_role_permissions
         WHERE project_id = $1
         ORDER BY role_name ASC`,
        [projectId]
      );

      return reply.send({ roles: rows });
    }
  );

  // POST /projects/:projectId/roles - Criar novo role customizado
  app.post(
    '/projects/:projectId/roles',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
      const projectId = (req.params as any).projectId as string;

      // Verificar se usuário tem permissão para criar roles (admin ou tech_lead)
      const userRole = await getProjectRole(app, projectId, userId);
      if (!userRole || (userRole.role !== 'admin' && userRole.role !== 'tech_lead')) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const { role_name, permissions } = z
        .object({
          role_name: z.string().min(1).max(100),
          permissions: z.record(z.string(), z.boolean()),
        })
        .parse(req.body);

      // Verificar se já existe um role com esse nome no projeto
      const existingRole = await app.db.query(
        'SELECT id FROM public.custom_role_permissions WHERE project_id = $1 AND role_name = $2',
        [projectId, role_name]
      );

      if (existingRole.rows.length > 0) {
        return reply.code(409).send({ error: 'Role com esse nome já existe neste projeto' });
      }

      // Inserir novo role
      const { rows } = await app.db.query<{
        id: string;
        role_name: string;
        permissions: RolePermissions;
        created_at: string;
        updated_at: string;
      }>(
        `INSERT INTO public.custom_role_permissions (project_id, role_name, permissions)
         VALUES ($1, $2, $3)
         RETURNING id, role_name, permissions, created_at, updated_at`,
        [projectId, role_name, JSON.stringify(permissions)]
      );

      return reply.code(201).send({ role: rows[0] });
    }
  );

  // GET /projects/:projectId/roles/:roleName - Obter permissões de um role
  app.get(
    '/projects/:projectId/roles/:roleName',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
      const projectId = (req.params as any).projectId as string;
      const roleName = decodeURIComponent((req.params as any).roleName as string);

      // Verificar se usuário tem permissão para ver roles (admin ou tech_lead)
      const userRole = await getProjectRole(app, projectId, userId);
      if (!userRole || (userRole.role !== 'admin' && userRole.role !== 'tech_lead')) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const { rows } = await app.db.query<{
        id: string;
        role_name: string;
        permissions: RolePermissions;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, role_name, permissions, created_at, updated_at
         FROM public.custom_role_permissions
         WHERE project_id = $1 AND role_name = $2`,
        [projectId, roleName]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Role não encontrado' });
      }

      return reply.send({ role: rows[0] });
    }
  );

  // PUT /projects/:projectId/roles/:roleName - Atualizar permissões de um role
  app.put(
    '/projects/:projectId/roles/:roleName',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
      const projectId = (req.params as any).projectId as string;
      const roleName = decodeURIComponent((req.params as any).roleName as string);

      // Verificar se usuário tem permissão para editar roles (admin ou tech_lead)
      const userRole = await getProjectRole(app, projectId, userId);
      if (!userRole || (userRole.role !== 'admin' && userRole.role !== 'tech_lead')) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const { permissions } = z
        .object({
          permissions: z.record(z.string(), z.boolean()),
        })
        .parse(req.body);

      // Verificar se role existe
      const existingRole = await app.db.query(
        'SELECT id FROM public.custom_role_permissions WHERE project_id = $1 AND role_name = $2',
        [projectId, roleName]
      );

      if (existingRole.rows.length === 0) {
        return reply.code(404).send({ error: 'Role não encontrado' });
      }

      // Atualizar apenas permissões (nome não pode ser alterado)
      const { rows } = await app.db.query<{
        id: string;
        role_name: string;
        permissions: RolePermissions;
        created_at: string;
        updated_at: string;
      }>(
        `UPDATE public.custom_role_permissions
         SET permissions = $1, updated_at = now()
         WHERE project_id = $2 AND role_name = $3
         RETURNING id, role_name, permissions, created_at, updated_at`,
        [JSON.stringify(permissions), projectId, roleName]
      );

      return reply.send({ role: rows[0] });
    }
  );

  // DELETE /projects/:projectId/roles/:roleName - Deletar role customizado
  app.delete(
    '/projects/:projectId/roles/:roleName',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
      const projectId = (req.params as any).projectId as string;
      const roleName = decodeURIComponent((req.params as any).roleName as string);

      // Verificar se usuário tem permissão para deletar roles (admin ou tech_lead)
      const userRole = await getProjectRole(app, projectId, userId);
      if (!userRole || (userRole.role !== 'admin' && userRole.role !== 'tech_lead')) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      // Verificar se há membros usando este role
      const membersUsingRole = await app.db.query(
        `SELECT COUNT(*) as count
         FROM public.project_members
         WHERE project_id = $1 AND role = 'custom' AND custom_role_name = $2`,
        [projectId, roleName]
      );

      const count = parseInt(membersUsingRole.rows[0]?.count || '0', 10);
      if (count > 0) {
        return reply.code(409).send({
          error: `Não é possível deletar este role pois há ${count} membro(s) usando-o`,
        });
      }

      // Deletar role
      const deleteResult = await app.db.query(
        'DELETE FROM public.custom_role_permissions WHERE project_id = $1 AND role_name = $2',
        [projectId, roleName]
      );

      if (deleteResult.rowCount === 0) {
        return reply.code(404).send({ error: 'Role não encontrado' });
      }

      return reply.send({ success: true });
    }
  );
}

