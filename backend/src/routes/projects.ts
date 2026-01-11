import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') +
    '-' +
    Date.now().toString(36)
  );
}

export async function projectRoutes(app: FastifyInstance) {
  async function getRoleForUser(projectId: string, userId: string): Promise<'admin' | 'tech_lead' | 'developer' | 'viewer' | null> {
    // Creator is admin by definition
    const creator = await app.db.query<{ created_by: string | null }>(
      'SELECT created_by FROM public.projects WHERE id = $1',
      [projectId]
    );
    if (creator.rows[0]?.created_by === userId) return 'admin';

    const { rows } = await app.db.query<{ role: any }>(
      'SELECT role FROM public.project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, userId]
    );
    return (rows[0]?.role as any) ?? null;
  }

  // GET /projects (projects the user is member of)
  app.get(
    '/projects',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const { rows } = await app.db.query(
        `SELECT DISTINCT p.*
         FROM public.projects p
         LEFT JOIN public.project_members pm ON pm.project_id = p.id
         WHERE pm.user_id = $1 OR p.created_by = $1
         ORDER BY p.created_at DESC`,
        [userId]
      );

      return reply.send(rows);
    }
  );

  // GET /projects/:projectId
  app.get(
    '/projects/:projectId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const projectId = (req.params as any).projectId as string;
      const role = await getRoleForUser(projectId, userId);
      if (!role) return reply.code(403).send({ error: 'Forbidden' });

      const { rows } = await app.db.query('SELECT * FROM public.projects WHERE id = $1', [projectId]);
      const project = rows[0] || null;
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      return reply.send(project);
    }
  );

  // GET /projects/:projectId/role
  app.get(
    '/projects/:projectId/role',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
      const projectId = (req.params as any).projectId as string;
      const role = await getRoleForUser(projectId, userId);
      if (!role) return reply.code(403).send({ error: 'Forbidden' });
      return reply.send({ role });
    }
  );

  // GET /projects/:projectId/members (enriched with profile)
  app.get(
    '/projects/:projectId/members',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
      const projectId = (req.params as any).projectId as string;

      const role = await getRoleForUser(projectId, userId);
      if (!role) return reply.code(403).send({ error: 'Forbidden' });

      const { rows } = await app.db.query(
        `SELECT pm.id, pm.role, pm.user_id, pm.created_at,
                jsonb_build_object(
                  'id', pr.user_id,
                  'full_name', pr.full_name,
                  'avatar_url', pr.avatar_url
                ) as profiles
         FROM public.project_members pm
         LEFT JOIN public.profiles pr ON pr.user_id = pm.user_id
         WHERE pm.project_id = $1
         ORDER BY pm.created_at ASC`,
        [projectId]
      );
      return reply.send({ members: rows });
    }
  );

  // POST /projects (create project + add admin membership)
  app.post(
    '/projects',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const body = createProjectSchema.parse(req.body);
      const slug = slugify(body.name);

      const projectResult = await app.db.query(
        `INSERT INTO public.projects (name, description, slug, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING *`,
        [body.name, body.description || null, slug, userId]
      );

      const project = projectResult.rows[0];

      await app.db.query(
        `INSERT INTO public.project_members (project_id, user_id, role, created_at)
         VALUES ($1, $2, 'admin', NOW())`,
        [project.id, userId]
      );

      return reply.code(201).send(project);
    }
  );

  // PUT /projects/:projectId (update name/description) - admin/tech_lead
  app.put(
    '/projects/:projectId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
      const projectId = (req.params as any).projectId as string;
      const role = await getRoleForUser(projectId, userId);
      if (!role) return reply.code(403).send({ error: 'Forbidden' });
      if (role !== 'admin' && role !== 'tech_lead') return reply.code(403).send({ error: 'Forbidden' });

      const body = createProjectSchema.parse(req.body);
      const { rows } = await app.db.query(
        `UPDATE public.projects
         SET name = $1, description = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [body.name, body.description || null, projectId]
      );
      return reply.send(rows[0]);
    }
  );

  // DELETE /projects/:projectId - admin only
  app.delete(
    '/projects/:projectId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
      const projectId = (req.params as any).projectId as string;
      const role = await getRoleForUser(projectId, userId);
      if (role !== 'admin') return reply.code(403).send({ error: 'Forbidden' });

      await app.db.query('DELETE FROM public.projects WHERE id = $1', [projectId]);
      return reply.send({ ok: true });
    }
  );

  // PUT /projects/:projectId/members/:memberId - Update member role (admin/tech_lead only)
  app.put(
    '/projects/:projectId/members/:memberId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
      const projectId = (req.params as any).projectId as string;
      const memberId = (req.params as any).memberId as string;
      const { role: newRole } = req.body as { role: string };

      if (!['admin', 'tech_lead', 'developer', 'viewer'].includes(newRole)) {
        return reply.code(400).send({ error: 'Invalid role' });
      }

      const role = await getRoleForUser(projectId, userId);
      if (role !== 'admin' && role !== 'tech_lead') {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      // Verify member belongs to project
      const memberCheck = await app.db.query(
        'SELECT user_id FROM public.project_members WHERE id = $1 AND project_id = $2',
        [memberId, projectId]
      );

      if (memberCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'Member not found' });
      }

      // Update role
      const { rows } = await app.db.query(
        `UPDATE public.project_members 
         SET role = $1 
         WHERE id = $2 AND project_id = $3
         RETURNING id, role, user_id, created_at`,
        [newRole, memberId, projectId]
      );

      return reply.send(rows[0]);
    }
  );

  // DELETE /projects/:projectId/members/:memberId - Remove member (admin/tech_lead only)
  app.delete(
    '/projects/:projectId/members/:memberId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
      const projectId = (req.params as any).projectId as string;
      const memberId = (req.params as any).memberId as string;

      const role = await getRoleForUser(projectId, userId);
      if (role !== 'admin' && role !== 'tech_lead') {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      // Verify member belongs to project
      const memberCheck = await app.db.query(
        'SELECT user_id FROM public.project_members WHERE id = $1 AND project_id = $2',
        [memberId, projectId]
      );

      if (memberCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'Member not found' });
      }

      // Don't allow removing yourself
      if (memberCheck.rows[0].user_id === userId) {
        return reply.code(400).send({ error: 'Cannot remove yourself' });
      }

      // Delete member
      await app.db.query(
        'DELETE FROM public.project_members WHERE id = $1 AND project_id = $2',
        [memberId, projectId]
      );

      return reply.code(204).send();
    }
  );
}


