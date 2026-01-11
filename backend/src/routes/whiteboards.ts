import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import crypto from 'node:crypto';
import { z } from 'zod';
import { createWhiteboardHub } from '../realtime/whiteboardHub.js';

const createWhiteboardSchema = z.object({
  name: z.string().min(1),
});

const updateWhiteboardSchema = z.object({
  name: z.string().min(1).optional(),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number(),
  }).optional(),
  canvas_snapshot: z.unknown().optional(),
  clientId: z.string().optional(),
});

const createCommentSchema = z.object({
  content: z.string().min(1),
  object_id: z.string().uuid().nullable().optional(),
  position_x: z.number().nullable().optional(),
  position_y: z.number().nullable().optional(),
  parent_comment_id: z.string().uuid().nullable().optional(),
  mentions: z.array(z.string().uuid()).optional(),
});

const updateCommentSchema = z.object({
  content: z.string().min(1).optional(),
  resolved: z.boolean().optional(),
});

export async function whiteboardRoutes(app: FastifyInstance) {
  type WsLike = {
    readyState: number;
    send: (data: string) => void;
    on: (event: string, listener: (...args: any[]) => void) => void;
    close: (code?: number, reason?: string) => void;
  };

  const hub = createWhiteboardHub(app);
  const loadSnapshotFromDb = async (whiteboardId: string) => {
    const { rows } = await app.db.query<{ canvas_snapshot: unknown; snapshot_version: number | string | null }>(
      `SELECT canvas_snapshot, snapshot_version
       FROM public.whiteboards
       WHERE id = $1`,
      [whiteboardId]
    );
    const row = rows[0];
    if (!row) return { snapshot: null, version: 0 };
    const rawVersion = row.snapshot_version ?? 0;
    const version = typeof rawVersion === 'string' ? Number(rawVersion) : (rawVersion ?? 0);
    return { snapshot: row.canvas_snapshot ?? null, version };
  };
  async function getProjectRole(projectId: string, userId: string) {
    const { rows } = await app.db.query<{ role: string }>(
      `SELECT role::text AS role FROM public.project_members WHERE project_id = $1 AND user_id = $2
       UNION
       SELECT 'admin'::text WHERE EXISTS (SELECT 1 FROM public.projects WHERE id = $1 AND created_by = $2)`,
      [projectId, userId]
    );
    if (rows.length === 0) return null;
    if (rows.some((row) => row.role === 'admin')) return 'admin';
    return rows[0].role;
  }

  async function getWhiteboardAccess(whiteboardId: string, userId: string) {
    const { rows } = await app.db.query<{ id: string; project_id: string }>(
      'SELECT id, project_id FROM public.whiteboards WHERE id = $1',
      [whiteboardId]
    );
    const whiteboard = rows[0];
    if (!whiteboard) return { whiteboard: null, role: null };
    const role = await getProjectRole(whiteboard.project_id, userId);
    return { whiteboard, role };
  }

  // GET /whiteboards?projectId=xxx
  app.get(
    '/whiteboards',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const projectId = (req.query as any)?.projectId as string;
      if (!projectId) return reply.code(400).send({ error: 'Missing projectId' });

      // Check if user has access to project
      const { rows: memberCheck } = await app.db.query<{ role: string }>(
        `SELECT role::text AS role FROM public.project_members WHERE project_id = $1 AND user_id = $2
         UNION
         SELECT 'admin'::text WHERE EXISTS (SELECT 1 FROM public.projects WHERE id = $1 AND created_by = $2)`,
        [projectId, userId]
      );
      if (memberCheck.length === 0) return reply.code(403).send({ error: 'Forbidden' });

      const { rows } = await app.db.query(
        `SELECT * FROM public.whiteboards
         WHERE project_id = $1
         ORDER BY created_at DESC`,
        [projectId]
      );

      return reply.send(rows);
    }
  );

  // GET /whiteboards/:id
  app.get(
    '/whiteboards/:id',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const whiteboardId = (req.params as any).id as string;

      const { rows } = await app.db.query(
        `SELECT wb.* FROM public.whiteboards wb
         WHERE wb.id = $1`,
        [whiteboardId]
      );

      if (rows.length === 0) return reply.code(404).send({ error: 'Whiteboard not found' });

      const wb = rows[0];

      // Check access via project membership
      const { rows: memberCheck } = await app.db.query<{ role: string }>(
        `SELECT role::text AS role FROM public.project_members WHERE project_id = $1 AND user_id = $2
         UNION
         SELECT 'admin'::text WHERE EXISTS (SELECT 1 FROM public.projects WHERE id = $1 AND created_by = $2)`,
        [wb.project_id, userId]
      );
      if (memberCheck.length === 0) return reply.code(403).send({ error: 'Forbidden' });

      return reply.send(wb);
    }
  );

  // POST /whiteboards
  app.post(
    '/whiteboards',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const body = createWhiteboardSchema.parse(req.body);
      const projectId = (req.query as any)?.projectId as string;
      if (!projectId) return reply.code(400).send({ error: 'Missing projectId' });

      // Check access
      const { rows: memberCheck } = await app.db.query<{ role: string }>(
        `SELECT role::text AS role FROM public.project_members WHERE project_id = $1 AND user_id = $2
         UNION
         SELECT 'admin'::text WHERE EXISTS (SELECT 1 FROM public.projects WHERE id = $1 AND created_by = $2)`,
        [projectId, userId]
      );
      if (memberCheck.length === 0) return reply.code(403).send({ error: 'Forbidden' });

      const { rows } = await app.db.query(
        `INSERT INTO public.whiteboards (project_id, name, created_by, viewport, branch_metadata, settings, canvas_snapshot, snapshot_version, created_at, updated_at)
         VALUES ($1, $2, $3, '{"x":0,"y":0,"zoom":1}'::jsonb, '{}'::jsonb, '{}'::jsonb, NULL, 0, NOW(), NOW())
         RETURNING *`,
        [projectId, body.name, userId]
      );

      return reply.code(201).send(rows[0]);
    }
  );

  // PUT /whiteboards/:id
  app.put(
    '/whiteboards/:id',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const whiteboardId = (req.params as any).id as string;
      const parsed = updateWhiteboardSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
      }
      const body = parsed.data;

      // Get whiteboard and check access
      const { rows: wbRows } = await app.db.query<{ project_id: string }>(
        'SELECT project_id FROM public.whiteboards WHERE id = $1',
        [whiteboardId]
      );
      if (wbRows.length === 0) return reply.code(404).send({ error: 'Whiteboard not found' });

      const { rows: memberCheck } = await app.db.query<{ role: string }>(
        `SELECT role::text AS role FROM public.project_members WHERE project_id = $1 AND user_id = $2
         UNION
         SELECT 'admin'::text WHERE EXISTS (SELECT 1 FROM public.projects WHERE id = $1 AND created_by = $2)`,
        [wbRows[0].project_id, userId]
      );
      if (memberCheck.length === 0) return reply.code(403).send({ error: 'Forbidden' });

      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (body.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(body.name);
      }
      if (body.viewport !== undefined) {
        updates.push(`viewport = $${paramIndex++}::jsonb`);
        values.push(JSON.stringify(body.viewport));
      }
      let snapshotJson: string | null = null;
      if (body.canvas_snapshot !== undefined) {
        try {
          snapshotJson = JSON.stringify(body.canvas_snapshot);
        } catch (err) {
          app.log.warn({ err }, 'Invalid canvas_snapshot payload');
          return reply.code(400).send({ error: 'Invalid canvas_snapshot payload' });
        }
        if (snapshotJson.length > 8 * 1024 * 1024) {
          return reply.code(413).send({ error: 'Snapshot too large' });
        }

        updates.push(`canvas_snapshot = $${paramIndex++}::jsonb`);
        updates.push(`snapshot_version = snapshot_version + 1`);
        values.push(snapshotJson);
      }

      if (updates.length === 0) return reply.code(400).send({ error: 'No updates provided' });

      updates.push(`updated_at = NOW()`);
      values.push(whiteboardId);

      let rows;
      try {
        ({ rows } = await app.db.query(
          `UPDATE public.whiteboards
           SET ${updates.join(', ')}
           WHERE id = $${paramIndex}
           RETURNING *`,
          values
        ));
      } catch (err) {
        const details = err as { code?: string; detail?: string; message?: string };
        app.log.error({ err, whiteboardId }, 'Failed to update whiteboard');
        return reply.code(500).send({
          error: 'Failed to update whiteboard',
          code: details.code,
          detail: details.detail || details.message,
        });
      }

      const updated = rows[0];

      if (body.canvas_snapshot !== undefined && snapshotJson !== null) {
        const rawVersion = updated?.snapshot_version ?? null;
        const version =
          typeof rawVersion === 'string' ? Number(rawVersion) : rawVersion;

        const payload = JSON.stringify({
          type: 'snapshot',
          whiteboardId,
          snapshot: body.canvas_snapshot,
          version,
          clientId: body.clientId ?? null,
        });
        hub.broadcast(whiteboardId, payload, body.clientId);
      }

      return reply.send(updated);
    }
  );

  // DELETE /whiteboards/:id
  app.delete(
    '/whiteboards/:id',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const whiteboardId = (req.params as any).id as string;

      // Get whiteboard and check access
      const { rows: wbRows } = await app.db.query<{ project_id: string }>(
        'SELECT project_id FROM public.whiteboards WHERE id = $1',
        [whiteboardId]
      );
      if (wbRows.length === 0) return reply.code(404).send({ error: 'Whiteboard not found' });

      const { rows: memberCheck } = await app.db.query<{ role: string }>(
        `SELECT role::text AS role FROM public.project_members WHERE project_id = $1 AND user_id = $2
         UNION
         SELECT 'admin'::text WHERE EXISTS (SELECT 1 FROM public.projects WHERE id = $1 AND created_by = $2)`,
        [wbRows[0].project_id, userId]
      );
      if (memberCheck.length === 0) return reply.code(403).send({ error: 'Forbidden' });

      await app.db.query('DELETE FROM public.whiteboards WHERE id = $1', [whiteboardId]);

      return reply.send({ ok: true });
    }
  );

  // WS /ws/whiteboards/:id
  app.get(
    '/ws/whiteboards/:id',
    { websocket: true },
    async (connection: SocketStream, req: FastifyRequest) => {
      try {
        const ws = ((connection as any).socket ?? connection) as WsLike;
        const whiteboardId = (req.params as any).id as string;
        const query = (req.query as any) || {};
        const token =
          typeof query.token === 'string'
            ? query.token
            : new URL(req.url || '', 'http://localhost').searchParams.get('token');
        const clientId =
          (typeof query.clientId === 'string' ? query.clientId : null) ||
          new URL(req.url || '', 'http://localhost').searchParams.get('clientId') ||
          crypto.randomUUID();

        if (!token) {
          app.log.warn({ whiteboardId }, 'whiteboard ws missing token');
          ws.close(1008, 'Unauthorized');
          return;
        }

        let decoded: { userId: string };
        try {
          decoded = (await app.jwt.verify(token)) as { userId: string };
        } catch (err) {
          app.log.warn({ err, whiteboardId }, 'whiteboard ws invalid token');
          ws.close(1008, 'Unauthorized');
          return;
        }

        const userId = decoded.userId;
        if (!userId) {
          app.log.warn({ whiteboardId }, 'whiteboard ws missing userId');
          ws.close(1008, 'Unauthorized');
          return;
        }

        const { rows } = await app.db.query<{ project_id: string; has_access: boolean }>(
          `SELECT wb.project_id,
                  (
                    EXISTS (
                      SELECT 1 FROM public.project_members pm
                      WHERE pm.project_id = wb.project_id AND pm.user_id = $2
                    )
                    OR EXISTS (
                      SELECT 1 FROM public.projects p
                      WHERE p.id = wb.project_id AND p.created_by = $2
                    )
                  ) AS has_access
           FROM public.whiteboards wb
           WHERE wb.id = $1`,
          [whiteboardId, userId]
        );

        const access = rows[0];
        if (!access || !access.has_access) {
          app.log.warn({ whiteboardId, userId }, 'whiteboard ws forbidden');
          ws.close(1008, 'Forbidden');
          return;
        }

        const client = {
          socket: ws,
          clientId,
          userId,
          whiteboardId,
          lastSeen: Date.now(),
        };
        hub.addClient(client);
        app.log.info({ whiteboardId, userId, clientId }, 'whiteboard ws connected');

        const current = await loadSnapshotFromDb(whiteboardId);
        if (current.snapshot !== null) {
          hub.safeSend(
            client,
            JSON.stringify({
              type: 'snapshot',
              whiteboardId,
              snapshot: current.snapshot,
              version: current.version,
            })
          );
        }

        ws.on('message', (message) => {
          const handle = async () => {
            hub.markAlive(client);
            const raw = message.toString();
            let data: any;
            try {
              data = JSON.parse(raw);
            } catch {
              return;
            }

            if (data?.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
              return;
            }

            if (data?.type === 'pong') {
              return;
            }

            if (data?.type !== 'snapshot' || !data?.snapshot) {
              return;
            }

            let snapshotJson: string;
            try {
              snapshotJson = JSON.stringify(data.snapshot);
            } catch (err) {
              app.log.warn({ err }, 'Invalid ws snapshot payload');
              return;
            }
            if (snapshotJson.length > 8 * 1024 * 1024) {
              ws.send(JSON.stringify({ type: 'error', error: 'Snapshot too large' }));
              return;
            }
            app.log.info(
              {
                whiteboardId,
                clientId,
                bytes: snapshotJson.length,
              },
              'whiteboard ws snapshot received'
            );

            const { rows: updateRows } = await app.db.query<{ snapshot_version: number | string }>(
              `UPDATE public.whiteboards
               SET canvas_snapshot = $1::jsonb, snapshot_version = snapshot_version + 1, updated_at = NOW()
               WHERE id = $2
               RETURNING snapshot_version`,
              [snapshotJson, whiteboardId]
            );

            const rawVersion = updateRows[0]?.snapshot_version ?? null;
            const version =
              typeof rawVersion === 'string' ? Number(rawVersion) : rawVersion;

            const payload = JSON.stringify({
              type: 'snapshot',
              whiteboardId,
              snapshot: data.snapshot,
              version,
              clientId,
            });

            hub.broadcast(whiteboardId, payload, clientId);
            hub.safeSend(client, JSON.stringify({ type: 'ack', version }));
          };

          void handle().catch((err) => {
            app.log.error({ err }, 'whiteboard ws message error');
          });
        });

        ws.on('pong', () => {
          hub.markAlive(client);
        });

        ws.on('close', (code, reason) => {
          hub.removeClient(client);
          app.log.info(
            {
              whiteboardId,
              userId,
              clientId,
              code,
              reason: reason ? reason.toString() : undefined,
            },
            'whiteboard ws closed'
          );
        });

        ws.on('error', (err) => {
          app.log.warn({ err, whiteboardId, userId, clientId }, 'whiteboard ws error');
        });
      } catch (err) {
        app.log.error({ err }, 'whiteboard ws handler error');
        try {
          const ws = ((connection as any).socket ?? connection) as WsLike;
          ws.close(1011, 'Internal error');
        } catch {
          // ignore close errors
        }
      }
    }
  );

  // GET /whiteboards/:id/comments
  app.get(
    '/whiteboards/:id/comments',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const whiteboardId = (req.params as any).id as string;
      const access = await getWhiteboardAccess(whiteboardId, userId);
      if (!access.whiteboard) return reply.code(404).send({ error: 'Whiteboard not found' });
      if (!access.role) return reply.code(403).send({ error: 'Forbidden' });

      const { rows } = await app.db.query(
        `SELECT wc.*, p.full_name, p.avatar_url
         FROM public.whiteboard_comments wc
         LEFT JOIN public.profiles p ON p.user_id = wc.user_id
         WHERE wc.whiteboard_id = $1
         ORDER BY wc.created_at ASC`,
        [whiteboardId]
      );

      const data = rows.map((row: any) => {
        const { full_name, avatar_url, ...comment } = row;
        return {
          ...comment,
          author: {
            full_name: full_name ?? null,
            avatar_url: avatar_url ?? null,
          },
        };
      });

      return reply.send(data);
    }
  );

  // POST /whiteboards/:id/comments
  app.post(
    '/whiteboards/:id/comments',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const whiteboardId = (req.params as any).id as string;
      const access = await getWhiteboardAccess(whiteboardId, userId);
      if (!access.whiteboard) return reply.code(404).send({ error: 'Whiteboard not found' });
      if (!access.role) return reply.code(403).send({ error: 'Forbidden' });

      const body = createCommentSchema.parse(req.body);
      const { rows } = await app.db.query(
        `INSERT INTO public.whiteboard_comments (
           whiteboard_id,
           object_id,
           user_id,
           content,
           position_x,
           position_y,
           parent_comment_id,
           created_at,
           updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING *`,
        [
          whiteboardId,
          body.object_id ?? null,
          userId,
          body.content,
          body.position_x ?? null,
          body.position_y ?? null,
          body.parent_comment_id ?? null,
        ]
      );

      const comment = rows[0];

      const mentionIds = Array.from(new Set(body.mentions ?? [])).filter(Boolean);
      if (mentionIds.length > 0) {
        const placeholders = mentionIds.map((_, index) => `($1, $${index + 2})`).join(', ');
        await app.db.query(
          `INSERT INTO public.mentions (comment_id, mentioned_user_id)
           VALUES ${placeholders}`,
          [comment.id, ...mentionIds]
        );
      }

      const { rows: authorRows } = await app.db.query(
        'SELECT full_name, avatar_url FROM public.profiles WHERE user_id = $1',
        [userId]
      );
      const author = authorRows[0] || { full_name: null, avatar_url: null };

      const payload = {
        ...comment,
        author: {
          full_name: author.full_name ?? null,
          avatar_url: author.avatar_url ?? null,
        },
      };

      hub.broadcast(
        whiteboardId,
        JSON.stringify({ type: 'comment.created', comment: payload })
      );

      return reply.code(201).send(payload);
    }
  );

  // PUT /whiteboards/:id/comments/:commentId
  app.put(
    '/whiteboards/:id/comments/:commentId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const whiteboardId = (req.params as any).id as string;
      const commentId = (req.params as any).commentId as string;
      const body = updateCommentSchema.parse(req.body);

      const access = await getWhiteboardAccess(whiteboardId, userId);
      if (!access.whiteboard) return reply.code(404).send({ error: 'Whiteboard not found' });
      if (!access.role) return reply.code(403).send({ error: 'Forbidden' });

      const { rows: commentRows } = await app.db.query<{ id: string; user_id: string; whiteboard_id: string }>(
        'SELECT id, user_id, whiteboard_id FROM public.whiteboard_comments WHERE id = $1',
        [commentId]
      );
      const comment = commentRows[0];
      if (!comment || comment.whiteboard_id !== whiteboardId) {
        return reply.code(404).send({ error: 'Comment not found' });
      }

      const role = access.role;
      if (comment.user_id !== userId && role !== 'admin' && role !== 'tech_lead') {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (body.content !== undefined) {
        updates.push(`content = $${paramIndex++}`);
        values.push(body.content);
      }
      if (body.resolved !== undefined) {
        updates.push(`resolved = $${paramIndex++}`);
        values.push(body.resolved);
      }

      if (updates.length === 0) return reply.code(400).send({ error: 'No updates provided' });

      updates.push('updated_at = NOW()');
      values.push(commentId);

      const { rows } = await app.db.query(
        `UPDATE public.whiteboard_comments
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );

      const updated = rows[0];
      const { rows: authorRows } = await app.db.query(
        'SELECT full_name, avatar_url FROM public.profiles WHERE user_id = $1',
        [updated.user_id]
      );
      const author = authorRows[0] || { full_name: null, avatar_url: null };
      const payload = {
        ...updated,
        author: {
          full_name: author.full_name ?? null,
          avatar_url: author.avatar_url ?? null,
        },
      };

      hub.broadcast(
        whiteboardId,
        JSON.stringify({ type: 'comment.updated', comment: payload })
      );

      return reply.send(payload);
    }
  );

  // DELETE /whiteboards/:id/comments/:commentId
  app.delete(
    '/whiteboards/:id/comments/:commentId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const whiteboardId = (req.params as any).id as string;
      const commentId = (req.params as any).commentId as string;

      const access = await getWhiteboardAccess(whiteboardId, userId);
      if (!access.whiteboard) return reply.code(404).send({ error: 'Whiteboard not found' });
      if (!access.role) return reply.code(403).send({ error: 'Forbidden' });

      const { rows: commentRows } = await app.db.query<{ id: string; user_id: string; whiteboard_id: string }>(
        'SELECT id, user_id, whiteboard_id FROM public.whiteboard_comments WHERE id = $1',
        [commentId]
      );
      const comment = commentRows[0];
      if (!comment || comment.whiteboard_id !== whiteboardId) {
        return reply.code(404).send({ error: 'Comment not found' });
      }

      const role = access.role;
      if (comment.user_id !== userId && role !== 'admin' && role !== 'tech_lead') {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      await app.db.query('DELETE FROM public.whiteboard_comments WHERE id = $1', [commentId]);
      hub.broadcast(
        whiteboardId,
        JSON.stringify({ type: 'comment.deleted', commentId })
      );
      return reply.send({ ok: true });
    }
  );

  // GET /whiteboards/:id/branches
  app.get(
    '/whiteboards/:id/branches',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const whiteboardId = (req.params as any).id as string;
      const access = await getWhiteboardAccess(whiteboardId, userId);
      if (!access.whiteboard) return reply.code(404).send({ error: 'Whiteboard not found' });
      if (!access.role) return reply.code(403).send({ error: 'Forbidden' });

      const { rows } = await app.db.query(
        `SELECT *
         FROM public.whiteboards
         WHERE parent_branch_id = $1
         ORDER BY created_at DESC`,
        [whiteboardId]
      );

      return reply.send(rows);
    }
  );

  // POST /whiteboards/:id/branches
  app.post(
    '/whiteboards/:id/branches',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const whiteboardId = (req.params as any).id as string;
      const access = await getWhiteboardAccess(whiteboardId, userId);
      if (!access.whiteboard) return reply.code(404).send({ error: 'Whiteboard not found' });
      if (!access.role) return reply.code(403).send({ error: 'Forbidden' });

      const body = z.object({ name: z.string().min(1) }).parse(req.body);

      const { rows: sourceRows } = await app.db.query(
        'SELECT * FROM public.whiteboards WHERE id = $1',
        [whiteboardId]
      );
      const source = sourceRows[0];
      if (!source) return reply.code(404).send({ error: 'Whiteboard not found' });

      const branchMetadata = {
        created_from: whiteboardId,
        created_at: new Date().toISOString(),
      };

      const { rows } = await app.db.query<{ id: string }>(
        `INSERT INTO public.whiteboards (
           project_id,
           name,
           branch_name,
           parent_branch_id,
           viewport,
           settings,
           created_by,
           branch_metadata,
           canvas_snapshot,
           snapshot_version,
           created_at,
           updated_at
         ) VALUES (
           $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::jsonb, $9::jsonb, 0, NOW(), NOW()
         )
         RETURNING id`,
        [
          source.project_id,
          `${source.name} (branch: ${body.name})`,
          body.name,
          whiteboardId,
          source.viewport ?? { x: 0, y: 0, zoom: 1 },
          source.settings ?? {},
          userId,
          JSON.stringify(branchMetadata),
          source.canvas_snapshot ?? null,
        ]
      );

      return reply.code(201).send({ id: rows[0].id });
    }
  );

  // POST /whiteboards/:id/branches/:branchId/merge
  app.post(
    '/whiteboards/:id/branches/:branchId/merge',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const targetId = (req.params as any).id as string;
      const branchId = (req.params as any).branchId as string;

      const access = await getWhiteboardAccess(targetId, userId);
      if (!access.whiteboard) return reply.code(404).send({ error: 'Whiteboard not found' });
      if (!access.role) return reply.code(403).send({ error: 'Forbidden' });

      const { rows: branchRows } = await app.db.query(
        'SELECT * FROM public.whiteboards WHERE id = $1',
        [branchId]
      );
      const branch = branchRows[0];
      if (!branch) return reply.code(404).send({ error: 'Branch not found' });
      if (branch.parent_branch_id !== targetId) {
        return reply.code(400).send({ error: 'Invalid branch relationship' });
      }

      await app.db.query(
        `UPDATE public.whiteboards
         SET
           canvas_snapshot = $1,
           viewport = $2::jsonb,
           settings = $3::jsonb,
           snapshot_version = snapshot_version + 1,
           updated_at = NOW()
         WHERE id = $4`,
        [branch.canvas_snapshot ?? null, branch.viewport ?? {}, branch.settings ?? {}, targetId]
      );

      await app.db.query(
        `UPDATE public.whiteboards
         SET branch_metadata = COALESCE(branch_metadata, '{}'::jsonb) || jsonb_build_object(
           'merged_at', NOW(),
           'merged_to', $1
         )
         WHERE id = $2`,
        [targetId, branchId]
      );

      return reply.send({ ok: true });
    }
  );
}
