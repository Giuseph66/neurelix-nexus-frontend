import { FastifyPluginAsync } from 'fastify';

export const boardViewRoutes: FastifyPluginAsync = async (app) => {
  // GET /board-views/:boardId - Get board view with workflow, statuses, transitions, and tarefas
  app.get('/board-views/:boardId', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { boardId } = req.params as { boardId: string };

    // Verify access
    const boardResult = await app.db.query(
      `SELECT b.* FROM boards b
       INNER JOIN project_members pm ON pm.project_id = b.project_id
       WHERE b.id = $1 AND pm.user_id = $2`,
      [boardId, (req as any).user.userId]
    );

    if (boardResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Board not found' });
    }

    const board = boardResult.rows[0];

    // Get default workflow
    const workflowResult = await app.db.query(
      `SELECT * FROM workflows WHERE board_id = $1 AND is_default = true LIMIT 1`,
      [boardId]
    );

    if (workflowResult.rows.length === 0) {
      return reply.code(404).send({ error: 'No workflow found for board' });
    }

    const workflow = workflowResult.rows[0];

    // Get statuses
    const statusesResult = await app.db.query(
      `SELECT * FROM workflow_statuses WHERE workflow_id = $1 ORDER BY position ASC`,
      [workflow.id]
    );

    const statuses = statusesResult.rows;

    // Get transitions
    const transitionsResult = await app.db.query(
      `SELECT * FROM workflow_transitions WHERE workflow_id = $1`,
      [workflow.id]
    );

    const transitions = transitionsResult.rows;

    // Get tarefas
    const tarefasResult = await app.db.query(
      `SELECT * FROM tarefas WHERE board_id = $1 ORDER BY backlog_position ASC NULLS LAST`,
      [boardId]
    );

    const tarefas = tarefasResult.rows;

    // Build columns
    const columns = statuses.map((status: any) => {
      const statusTransitions = transitions
        .filter((t: any) => t.from_status_id === status.id)
        .map((t: any) => t.to_status_id);

      const columnTarefas = tarefas
        .filter((t: any) => t.status_id === status.id)
        .map((t: any) => ({
          ...t,
          status,
        }));

      return {
        status,
        tarefas: columnTarefas,
        allowedTransitions: statusTransitions,
      };
    });

    return reply.send({
      board,
      workflow,
      columns,
    });
  });
};

