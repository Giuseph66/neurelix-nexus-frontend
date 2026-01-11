import { FastifyPluginAsync } from 'fastify';

export const boardRoutes: FastifyPluginAsync = async (app) => {
  // GET /boards?projectId=xxx - List boards for a project
  app.get('/boards', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const projectId = (req.query as { projectId?: string }).projectId;
    if (!projectId) {
      return reply.code(400).send({ error: 'projectId is required' });
    }

    // Verify user has access to project
    const memberCheck = await app.db.query(
      'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, (req as any).user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    const result = await app.db.query(
      `SELECT * FROM boards 
       WHERE project_id = $1 
       ORDER BY created_at DESC`,
      [projectId]
    );

    return reply.send(result.rows);
  });

  // GET /boards/:id - Get single board
  app.get('/boards/:id', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const result = await app.db.query(
      `SELECT b.* FROM boards b
       INNER JOIN project_members pm ON pm.project_id = b.project_id
       WHERE b.id = $1 AND pm.user_id = $2`,
      [id, (req as any).user.userId]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Board not found' });
    }

    return reply.send(result.rows[0]);
  });

  // POST /boards - Create board
  app.post('/boards', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { project_id, name, description, type } = req.body as {
      project_id: string;
      name: string;
      description?: string;
      type?: string;
    };

    if (!project_id || !name) {
      return reply.code(400).send({ error: 'project_id and name are required' });
    }

    // Verify user has access to project
    const memberCheck = await app.db.query(
      'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
      [project_id, (req as any).user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    // Create board
    const boardResult = await app.db.query(
      `INSERT INTO boards (project_id, name, description, type, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [project_id, name, description || null, type || 'KANBAN', (req as any).user.userId]
    );

    const board = boardResult.rows[0];

    // Create default workflow
    const workflowResult = await app.db.query(
      `INSERT INTO workflows (board_id, name, is_default)
       VALUES ($1, 'Default Workflow', true)
       RETURNING *`,
      [board.id]
    );

    const workflow = workflowResult.rows[0];

    // Create default statuses: To Do, In Progress, Done
    const statuses = [
      { name: 'To Do', color: '#6B7280', position: 0, is_initial: true, is_final: false },
      { name: 'In Progress', color: '#3B82F6', position: 1, is_initial: false, is_final: false },
      { name: 'Done', color: '#10B981', position: 2, is_initial: false, is_final: true },
    ];

    for (const status of statuses) {
      await app.db.query(
        `INSERT INTO workflow_statuses (workflow_id, name, color, position, is_initial, is_final)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [workflow.id, status.name, status.color, status.position, status.is_initial, status.is_final]
      );
    }

    // Create transitions: To Do -> In Progress, In Progress -> Done
    const statusResults = await app.db.query(
      'SELECT id, position FROM workflow_statuses WHERE workflow_id = $1 ORDER BY position',
      [workflow.id]
    );

    const statusIds = statusResults.rows.map((r: any) => r.id);
    if (statusIds.length >= 2) {
      // To Do -> In Progress
      await app.db.query(
        'INSERT INTO workflow_transitions (workflow_id, from_status_id, to_status_id) VALUES ($1, $2, $3)',
        [workflow.id, statusIds[0], statusIds[1]]
      );
      // In Progress -> Done
      if (statusIds.length >= 3) {
        await app.db.query(
          'INSERT INTO workflow_transitions (workflow_id, from_status_id, to_status_id) VALUES ($1, $2, $3)',
          [workflow.id, statusIds[1], statusIds[2]]
        );
      }
    }

    return reply.code(201).send(board);
  });

  // PUT /boards/:id - Update board
  app.put('/boards/:id', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name, description, type } = req.body as {
      name?: string;
      description?: string;
      type?: string;
    };

    // Verify user has access
    const memberCheck = await app.db.query(
      `SELECT b.id FROM boards b
       INNER JOIN project_members pm ON pm.project_id = b.project_id
       WHERE b.id = $1 AND pm.user_id = $2`,
      [id, (req as any).user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'Board not found' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      values.push(type);
    }

    if (updates.length === 0) {
      return reply.code(400).send({ error: 'No fields to update' });
    }

    updates.push(`updated_at = now()`);
    values.push(id);

    const result = await app.db.query(
      `UPDATE boards SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return reply.send(result.rows[0]);
  });

  // DELETE /boards/:id - Delete board
  app.delete('/boards/:id', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    // Verify user has access (admin only)
    const memberCheck = await app.db.query(
      `SELECT pm.role FROM boards b
       INNER JOIN project_members pm ON pm.project_id = b.project_id
       WHERE b.id = $1 AND pm.user_id = $2`,
      [id, (req as any).user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'Board not found' });
    }

    if (memberCheck.rows[0].role !== 'admin') {
      return reply.code(403).send({ error: 'Only admins can delete boards' });
    }

    await app.db.query('DELETE FROM boards WHERE id = $1', [id]);

    return reply.code(204).send();
  });
};

