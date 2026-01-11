import { FastifyPluginAsync } from 'fastify';

export const tarefaRoutes: FastifyPluginAsync = async (app) => {
  // GET /tarefas?projectId=xxx - List tarefas for a project (backlog)
  app.get('/tarefas', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const projectId = (req.query as { projectId?: string }).projectId;
    const boardId = (req.query as { boardId?: string }).boardId;

    if (!projectId && !boardId) {
      return reply.code(400).send({ error: 'projectId or boardId is required' });
    }

    // Verify user has access
    let memberCheck;
    if (projectId) {
      memberCheck = await app.db.query(
        'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
        [projectId, (req as any).user.userId]
      );
    } else {
      memberCheck = await app.db.query(
        `SELECT pm.id FROM project_members pm
         INNER JOIN boards b ON b.project_id = pm.project_id
         WHERE b.id = $1 AND pm.user_id = $2`,
        [boardId, (req as any).user.userId]
      );
    }

    if (memberCheck.rows.length === 0) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    let query = 'SELECT * FROM tarefas WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (projectId) {
      query += ` AND project_id = $${paramIndex++}`;
      params.push(projectId);
    }
    if (boardId) {
      query += ` AND board_id = $${paramIndex++}`;
      params.push(boardId);
    }

    query += ' ORDER BY backlog_position ASC NULLS LAST, created_at DESC';

    const result = await app.db.query(query, params);
    return reply.send(result.rows);
  });

  // GET /tarefas/:id - Get single tarefa
  app.get('/tarefas/:id', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const result = await app.db.query(
      `SELECT t.*,
              ws.name as status_name, ws.color as status_color,
              jsonb_build_object('id', assignee_pr.user_id, 'full_name', assignee_pr.full_name, 'avatar_url', assignee_pr.avatar_url) as assignee,
              jsonb_build_object('id', reporter_pr.user_id, 'full_name', reporter_pr.full_name, 'avatar_url', reporter_pr.avatar_url) as reporter
       FROM tarefas t
       LEFT JOIN workflow_statuses ws ON ws.id = t.status_id
       LEFT JOIN public.profiles assignee_pr ON assignee_pr.user_id = t.assignee_id
       LEFT JOIN public.profiles reporter_pr ON reporter_pr.user_id = t.reporter_id
       INNER JOIN project_members pm ON pm.project_id = t.project_id
       WHERE t.id = $1 AND pm.user_id = $2`,
      [id, (req as any).user.userId]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Tarefa not found' });
    }

    const tarefa = result.rows[0];
    
    // Parse JSON fields if they're strings
    let assignee = tarefa.assignee;
    let reporter = tarefa.reporter;
    
    if (typeof assignee === 'string') {
      try {
        assignee = JSON.parse(assignee);
      } catch {
        assignee = null;
      }
    }
    
    if (typeof reporter === 'string') {
      try {
        reporter = JSON.parse(reporter);
      } catch {
        reporter = null;
      }
    }
    
    return reply.send({
      ...tarefa,
      assignee: assignee && assignee.id ? assignee : null,
      reporter: reporter && reporter.id ? reporter : null,
      status: tarefa.status_id ? {
        id: tarefa.status_id,
        name: tarefa.status_name,
        color: tarefa.status_color,
      } : null,
    });
  });

  // POST /tarefas - Create tarefa
  app.post('/tarefas', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    try {
    const {
      project_id,
      board_id,
      type,
      title,
      description,
      priority,
      assignee_id,
      epic_id,
      sprint_id,
      labels,
      due_date,
      estimated_hours,
    } = req.body as {
      project_id: string;
      board_id?: string;
      type?: string;
      title: string;
      description?: string;
      priority?: string;
      assignee_id?: string;
      epic_id?: string;
      sprint_id?: string;
      labels?: string[];
      due_date?: string;
      estimated_hours?: number;
    };

    if (!project_id || !title) {
      return reply.code(400).send({ error: 'project_id and title are required' });
    }

    // Verify user has access
    const memberCheck = await app.db.query(
      'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
      [project_id, (req as any).user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    // Generate key (atomic): uses projects.slug + project_sequences.last_sequence
    // This avoids relying on a non-existent projects.key column and prevents race conditions.
    const seqResult = await app.db.query(
      `
      WITH seq AS (
        INSERT INTO public.project_sequences (project_id, last_sequence)
        VALUES ($1, 1)
        ON CONFLICT (project_id)
        DO UPDATE SET last_sequence = public.project_sequences.last_sequence + 1
        RETURNING last_sequence
      )
      SELECT p.slug, seq.last_sequence
      FROM seq
      INNER JOIN public.projects p ON p.id = $1
      `,
      [project_id]
    );

    if (seqResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const slug = String(seqResult.rows[0].slug || 'PROJ');
    const nextNum = Number(seqResult.rows[0].last_sequence) || 1;
    const key = `${slug.toUpperCase()}-${nextNum}`;

    // Get initial status if board is provided
    let statusId: string | undefined;
    if (board_id) {
      const workflowResult = await app.db.query(
        `SELECT id FROM workflows WHERE board_id = $1 AND is_default = true LIMIT 1`,
        [board_id]
      );

      if (workflowResult.rows.length > 0) {
        const statusResult = await app.db.query(
          `SELECT id FROM workflow_statuses WHERE workflow_id = $1 AND is_initial = true LIMIT 1`,
          [workflowResult.rows[0].id]
        );
        statusId = statusResult.rows[0]?.id;
      }
    }

    // Create tarefa
    const tarefaResult = await app.db.query(
      `INSERT INTO tarefas (
        project_id, board_id, key, type, title, description, status_id,
        priority, assignee_id, reporter_id, epic_id, sprint_id, labels,
        due_date, estimated_hours
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        project_id,
        board_id || null,
        key,
        type || 'TASK',
        title,
        description || null,
        statusId || null,
        priority || 'MEDIUM',
        assignee_id || null,
        (req as any).user.userId,
        epic_id || null,
        sprint_id || null,
        labels || [],
        due_date || null,
        estimated_hours || null,
      ]
    );

    const tarefa = tarefaResult.rows[0];

    // Log activity
    await app.db.query(
      `INSERT INTO tarefa_activity_log (tarefa_id, user_id, action, new_value)
       VALUES ($1, $2, 'created', $3)`,
      [tarefa.id, (req as any).user.userId, title]
    );

    return reply.code(201).send(tarefa);
    } catch (error: any) {
      app.log.error(error);
      return reply.code(500).send({ 
        error: 'Internal server error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  });

  // PUT /tarefas/:id - Update tarefa
  app.put('/tarefas/:id', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const updates = req.body as Record<string, any>;

    // Get old tarefa
    const oldResult = await app.db.query('SELECT * FROM tarefas WHERE id = $1', [id]);
    if (oldResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Tarefa not found' });
    }

    const oldTarefa = oldResult.rows[0];

    // Verify user has access
    const memberCheck = await app.db.query(
      'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
      [oldTarefa.project_id, (req as any).user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    // Build update query
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const allowedFields = [
      'title', 'description', 'type', 'status_id', 'priority', 'assignee_id',
      'epic_id', 'sprint_id', 'labels', 'due_date', 'estimated_hours', 'backlog_position',
    ];

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
      `UPDATE tarefas SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    const newTarefa = result.rows[0];

    // Log changes
    const changes: Array<{ field: string; old: any; new: any }> = [];
    if (updates.title !== undefined && updates.title !== oldTarefa.title) {
      changes.push({ field: 'title', old: oldTarefa.title, new: updates.title });
    }
    if (updates.priority !== undefined && updates.priority !== oldTarefa.priority) {
      changes.push({ field: 'priority', old: oldTarefa.priority, new: updates.priority });
    }
    if (updates.assignee_id !== undefined && updates.assignee_id !== oldTarefa.assignee_id) {
      changes.push({ field: 'assignee', old: oldTarefa.assignee_id, new: updates.assignee_id });
    }
    if (updates.status_id !== undefined && updates.status_id !== oldTarefa.status_id) {
      // Get status names
      const oldStatus = oldTarefa.status_id
        ? await app.db.query('SELECT name FROM workflow_statuses WHERE id = $1', [oldTarefa.status_id])
        : { rows: [] };
      const newStatus = updates.status_id
        ? await app.db.query('SELECT name FROM workflow_statuses WHERE id = $1', [updates.status_id])
        : { rows: [] };
      changes.push({
        field: 'status',
        old: oldStatus.rows[0]?.name || null,
        new: newStatus.rows[0]?.name || null,
      });
    }

    for (const change of changes) {
      await app.db.query(
        `INSERT INTO tarefa_activity_log (tarefa_id, user_id, action, field_name, old_value, new_value)
         VALUES ($1, $2, 'updated', $3, $4, $5)`,
        [id, (req as any).user.userId, change.field, String(change.old || ''), String(change.new || '')]
      );
    }

    return reply.send(newTarefa);
  });

  // DELETE /tarefas/:id - Delete tarefa
  app.delete('/tarefas/:id', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const tarefaResult = await app.db.query('SELECT project_id, board_id FROM tarefas WHERE id = $1', [id]);
    if (tarefaResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Tarefa not found' });
    }

    // Verify user has access
    const memberCheck = await app.db.query(
      'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
      [tarefaResult.rows[0].project_id, (req as any).user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    await app.db.query('DELETE FROM tarefas WHERE id = $1', [id]);

    return reply.code(204).send();
  });

  // GET /tarefas/:id/comments - Get comments for a tarefa
  app.get('/tarefas/:id/comments', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    // Verify access
    const tarefaResult = await app.db.query(
      `SELECT t.id FROM tarefas t
       INNER JOIN project_members pm ON pm.project_id = t.project_id
       WHERE t.id = $1 AND pm.user_id = $2`,
      [id, (req as any).user.userId]
    );

    if (tarefaResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Tarefa not found' });
    }

    const result = await app.db.query(
      `SELECT tc.*,
              jsonb_build_object('id', pr.user_id, 'full_name', pr.full_name, 'avatar_url', pr.avatar_url) as author
       FROM tarefa_comments tc
       LEFT JOIN public.profiles pr ON pr.user_id = tc.created_by
       WHERE tc.tarefa_id = $1
       ORDER BY tc.created_at ASC`,
      [id]
    );

    return reply.send(result.rows);
  });

  // POST /tarefas/:id/comments - Create comment
  app.post('/tarefas/:id/comments', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { content } = req.body as { content: string };

    if (!content) {
      return reply.code(400).send({ error: 'content is required' });
    }

    // Verify access
    const tarefaResult = await app.db.query(
      `SELECT t.id FROM tarefas t
       INNER JOIN project_members pm ON pm.project_id = t.project_id
       WHERE t.id = $1 AND pm.user_id = $2`,
      [id, (req as any).user.userId]
    );

    if (tarefaResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Tarefa not found' });
    }

    const commentResult = await app.db.query(
      `INSERT INTO tarefa_comments (tarefa_id, content, created_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, content, (req as any).user.userId]
    );

    // Log activity
    await app.db.query(
      `INSERT INTO tarefa_activity_log (tarefa_id, user_id, action)
       VALUES ($1, $2, 'commented')`,
      [id, (req as any).user.userId]
    );

    return reply.code(201).send(commentResult.rows[0]);
  });

  // GET /tarefas/:id/activity - Get activity log
  app.get('/tarefas/:id/activity', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    // Verify access
    const tarefaResult = await app.db.query(
      `SELECT t.id FROM tarefas t
       INNER JOIN project_members pm ON pm.project_id = t.project_id
       WHERE t.id = $1 AND pm.user_id = $2`,
      [id, (req as any).user.userId]
    );

    if (tarefaResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Tarefa not found' });
    }

    const result = await app.db.query(
      `SELECT tal.*,
              jsonb_build_object('id', pr.user_id, 'full_name', pr.full_name, 'avatar_url', pr.avatar_url) as "user"
       FROM tarefa_activity_log tal
       LEFT JOIN public.profiles pr ON pr.user_id = tal.user_id
       WHERE tal.tarefa_id = $1
       ORDER BY tal.created_at DESC`,
      [id]
    );

    return reply.send(result.rows);
  });
};

