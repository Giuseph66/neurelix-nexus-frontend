import { FastifyPluginAsync } from 'fastify';

export const sprintRoutes: FastifyPluginAsync = async (app) => {
  // GET /sprints?projectId=xxx - List sprints for a project
  app.get('/sprints', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { projectId } = req.query as { projectId?: string };
    
    if (!projectId) {
      return reply.code(400).send({ error: 'projectId is required' });
    }

    // Verify access
    const memberCheck = await app.db.query(
      'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, (req as any).user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    const result = await app.db.query(
      `SELECT * FROM sprints 
       WHERE project_id = $1 
       ORDER BY created_at DESC`,
      [projectId]
    );

    return reply.send(result.rows);
  });

  // POST /sprints - Create sprint
  app.post('/sprints', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const {
      project_id,
      board_id,
      name,
      goal,
      start_date,
      end_date,
    } = req.body as {
      project_id: string;
      board_id?: string;
      name: string;
      goal?: string;
      start_date?: string;
      end_date?: string;
    };

    if (!project_id || !name) {
      return reply.code(400).send({ error: 'project_id and name are required' });
    }

    // Verify access
    const memberCheck = await app.db.query(
      'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
      [project_id, (req as any).user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    const result = await app.db.query(
      `INSERT INTO sprints (project_id, board_id, name, goal, start_date, end_date, state, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'PLANNED', $7)
       RETURNING *`,
      [
        project_id,
        board_id || null,
        name,
        goal || null,
        start_date || null,
        end_date || null,
        (req as any).user.userId,
      ]
    );

    return reply.code(201).send(result.rows[0]);
  });

  // PUT /sprints/:id - Update sprint
  app.put('/sprints/:id', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const updates = req.body as Record<string, any>;

    // Get old sprint
    const oldResult = await app.db.query('SELECT * FROM sprints WHERE id = $1', [id]);
    if (oldResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Sprint not found' });
    }

    const oldSprint = oldResult.rows[0];

    // Verify access
    const memberCheck = await app.db.query(
      'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
      [oldSprint.project_id, (req as any).user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    // Build update query
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const allowedFields = ['name', 'goal', 'start_date', 'end_date', 'state'];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updateFields.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (updateFields.length === 0) {
      return reply.code(400).send({ error: 'No valid fields to update' });
    }

    updateFields.push(`updated_at = now()`);
    values.push(id);

    const result = await app.db.query(
      `UPDATE sprints SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return reply.send(result.rows[0]);
  });

  // POST /sprints/:id/start - Start sprint
  app.post('/sprints/:id/start', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    // Get sprint
    const sprintResult = await app.db.query('SELECT * FROM sprints WHERE id = $1', [id]);
    if (sprintResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Sprint not found' });
    }

    const sprint = sprintResult.rows[0];

    // Verify access
    const memberCheck = await app.db.query(
      'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
      [sprint.project_id, (req as any).user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    // Close any active sprint in the same project
    await app.db.query(
      `UPDATE sprints 
       SET state = 'DONE', end_date = COALESCE(end_date, CURRENT_DATE)
       WHERE project_id = $1 AND state = 'ACTIVE'`,
      [sprint.project_id]
    );

    // Start this sprint
    const result = await app.db.query(
      `UPDATE sprints 
       SET state = 'ACTIVE', start_date = COALESCE(start_date, CURRENT_DATE)
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    return reply.send(result.rows[0]);
  });

  // POST /sprints/:id/complete - Complete sprint
  app.post('/sprints/:id/complete', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    // Get sprint
    const sprintResult = await app.db.query('SELECT * FROM sprints WHERE id = $1', [id]);
    if (sprintResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Sprint not found' });
    }

    const sprint = sprintResult.rows[0];

    // Verify access
    const memberCheck = await app.db.query(
      'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
      [sprint.project_id, (req as any).user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    // Mark sprint as done
    const result = await app.db.query(
      `UPDATE sprints 
       SET state = 'DONE', end_date = COALESCE(end_date, CURRENT_DATE)
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    // Get final status IDs (statuses with is_final = true)
    const finalStatusResult = await app.db.query(
      `SELECT id FROM workflow_statuses WHERE is_final = true`
    );
    const finalStatusIds = finalStatusResult.rows.map(r => r.id);

    // Move incomplete tarefas back to backlog (remove sprint_id)
    if (finalStatusIds.length > 0) {
      await app.db.query(
        `UPDATE tarefas 
         SET sprint_id = null 
         WHERE sprint_id = $1 
         AND (status_id IS NULL OR status_id NOT IN (${finalStatusIds.map((_, i) => `$${i + 2}`).join(', ')}))`,
        [id, ...finalStatusIds]
      );
    } else {
      // If no final statuses, just remove sprint_id from all tarefas
      await app.db.query(
        `UPDATE tarefas SET sprint_id = null WHERE sprint_id = $1`,
        [id]
      );
    }

    return reply.send(result.rows[0]);
  });
};

