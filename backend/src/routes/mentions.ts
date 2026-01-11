import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export async function mentionsRoutes(app: FastifyInstance) {
  // GET /mentions
  app.get(
    '/mentions',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const { rows } = await app.db.query(
        `SELECT
           m.*,
           wc.content,
           wc.whiteboard_id,
           wc.user_id AS comment_user_id,
           p.full_name AS author_full_name,
           wb.name AS whiteboard_name
         FROM public.mentions m
         LEFT JOIN public.whiteboard_comments wc ON wc.id = m.comment_id
         LEFT JOIN public.profiles p ON p.user_id = wc.user_id
         LEFT JOIN public.whiteboards wb ON wb.id = wc.whiteboard_id
         WHERE m.mentioned_user_id = $1
         ORDER BY m.created_at DESC
         LIMIT 50`,
        [userId]
      );

      const data = rows.map((row: any) => {
        const {
          content,
          whiteboard_id,
          comment_user_id,
          author_full_name,
          whiteboard_name,
          ...mention
        } = row;

        const comment = row.comment_id
          ? {
              id: row.comment_id,
              content,
              whiteboard_id,
              user_id: comment_user_id,
              author: { full_name: author_full_name ?? null },
              whiteboard: whiteboard_name ? { name: whiteboard_name } : undefined,
            }
          : undefined;

        return {
          ...mention,
          comment,
        };
      });

      return reply.send(data);
    }
  );

  // PUT /mentions/:id (mark as read)
  app.put(
    '/mentions/:id',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const mentionId = (req.params as any).id as string;

      await app.db.query(
        `UPDATE public.mentions
         SET read = true
         WHERE id = $1 AND mentioned_user_id = $2`,
        [mentionId, userId]
      );

      return reply.send({ ok: true });
    }
  );

  // PUT /mentions/read-all
  app.put(
    '/mentions/read-all',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      await app.db.query(
        `UPDATE public.mentions
         SET read = true
         WHERE mentioned_user_id = $1 AND read = false`,
        [userId]
      );

      return reply.send({ ok: true });
    }
  );
}
