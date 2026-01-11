import { FastifyPluginAsync } from 'fastify';

export const workflowRoutes: FastifyPluginAsync = async (app) => {
  // POST /workflows/:workflowId/statuses/reorder - Reorder statuses (columns)
  app.post('/workflows/:workflowId/statuses/reorder', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    try {
      const { workflowId } = req.params as { workflowId: string };
      const { orderedStatusIds } = req.body as { orderedStatusIds: string[] };

      if (!Array.isArray(orderedStatusIds) || orderedStatusIds.length === 0) {
        return reply.code(400).send({ error: 'orderedStatusIds must be a non-empty array' });
      }

      // Verify access
      const workflowResult = await app.db.query(
        `SELECT w.id FROM workflows w
         INNER JOIN boards b ON b.id = w.board_id
         INNER JOIN project_members pm ON pm.project_id = b.project_id
         WHERE w.id = $1 AND pm.user_id = $2`,
        [workflowId, (req as any).user.userId]
      );

      if (workflowResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Workflow not found' });
      }

      // Update positions one by one (simpler and more reliable)
      for (let i = 0; i < orderedStatusIds.length; i++) {
        await app.db.query(
          `UPDATE workflow_statuses
           SET position = $1
           WHERE id = $2 AND workflow_id = $3`,
          [i, orderedStatusIds[i], workflowId]
        );
      }

      return reply.send({ ok: true });
    } catch (err: any) {
      app.log.error(err);
      return reply.code(500).send({ 
        error: 'Internal server error',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      });
    }
  });

  // POST /workflows/:workflowId/statuses - Create workflow status
  app.post('/workflows/:workflowId/statuses', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { workflowId } = req.params as { workflowId: string };
    const { name, color, position } = req.body as {
      name: string;
      color?: string;
      position?: number;
    };

    if (!name) {
      return reply.code(400).send({ error: 'name is required' });
    }

    // Verify user has access to the workflow's board
    const workflowResult = await app.db.query(
      `SELECT b.id, b.project_id FROM workflows w
       INNER JOIN boards b ON b.id = w.board_id
       INNER JOIN project_members pm ON pm.project_id = b.project_id
       WHERE w.id = $1 AND pm.user_id = $2`,
      [workflowId, (req as any).user.userId]
    );

    if (workflowResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Workflow not found' });
    }

    // Get max position if not provided
    let finalPosition = position;
    if (finalPosition === undefined) {
      const positionResult = await app.db.query(
        `SELECT COALESCE(MAX(position), 0) + 1 as next_position
         FROM workflow_statuses WHERE workflow_id = $1`,
        [workflowId]
      );
      finalPosition = parseInt(positionResult.rows[0].next_position);
    }

    const result = await app.db.query(
      `INSERT INTO workflow_statuses (workflow_id, name, color, position, is_initial, is_final)
       VALUES ($1, $2, $3, $4, false, false)
       RETURNING *`,
      [workflowId, name, color || '#6b7280', finalPosition]
    );

    return reply.code(201).send(result.rows[0]);
  });

  // PUT /workflows/:workflowId/statuses/:statusId - Update workflow status
  app.put('/workflows/:workflowId/statuses/:statusId', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { workflowId, statusId } = req.params as { workflowId: string; statusId: string };
    const { name, color } = req.body as { name?: string; color?: string };

    // Verify access
    const workflowResult = await app.db.query(
      `SELECT w.id FROM workflows w
       INNER JOIN boards b ON b.id = w.board_id
       INNER JOIN project_members pm ON pm.project_id = b.project_id
       WHERE w.id = $1 AND pm.user_id = $2`,
      [workflowId, (req as any).user.userId]
    );

    if (workflowResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Workflow not found' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (color !== undefined) {
      updates.push(`color = $${paramIndex++}`);
      values.push(color);
    }

    if (updates.length === 0) {
      return reply.code(400).send({ error: 'No fields to update' });
    }

    // NOTE: keep parameter ordering explicit to avoid mixing workflowId with dynamic fields
    values.push(statusId);
    values.push(workflowId);

    const result = await app.db.query(
      `UPDATE workflow_statuses
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND workflow_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Status not found' });
    }

    return reply.send(result.rows[0]);
  });

  // DELETE /workflows/:workflowId/statuses/:statusId - Delete workflow status
  app.delete('/workflows/:workflowId/statuses/:statusId', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { workflowId, statusId } = req.params as { workflowId: string; statusId: string };

    // Verify access
    const workflowResult = await app.db.query(
      `SELECT w.id FROM workflows w
       INNER JOIN boards b ON b.id = w.board_id
       INNER JOIN project_members pm ON pm.project_id = b.project_id
       WHERE w.id = $1 AND pm.user_id = $2`,
      [workflowId, (req as any).user.userId]
    );

    if (workflowResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Workflow not found' });
    }

    // Check if there are tarefas in this status
    const tarefasResult = await app.db.query(
      'SELECT id FROM tarefas WHERE status_id = $1 LIMIT 1',
      [statusId]
    );

    if (tarefasResult.rows.length > 0) {
      return reply.code(400).send({
        error: 'Não é possível excluir uma coluna com tarefas. Mova as tarefas primeiro.',
      });
    }

    // Delete transitions involving this status
    await app.db.query(
      `DELETE FROM workflow_transitions
       WHERE workflow_id = $1 AND (from_status_id = $2 OR to_status_id = $2)`,
      [workflowId, statusId]
    );

    // Delete status
    await app.db.query(
      'DELETE FROM workflow_statuses WHERE id = $1 AND workflow_id = $2',
      [statusId, workflowId]
    );

    return reply.code(204).send();
  });
};

