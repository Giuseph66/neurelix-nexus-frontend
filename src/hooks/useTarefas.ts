import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type {
  Board,
  Tarefa,
  WorkflowStatus,
  Workflow,
  WorkflowTransition,
  TarefaComment,
  TarefaActivityLog,
  CreateTarefaInput,
  UpdateTarefaInput,
  CreateBoardInput,
  CreateCommentInput,
  BoardView,
  BoardColumn,
} from '@/types/tarefas';

// Hook to fetch boards for a project
export function useBoards(projectId: string | undefined) {
  return useQuery({
    queryKey: ['boards', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from('boards')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Board[];
    },
    enabled: !!projectId,
  });
}

// Hook to fetch a single board with workflow and statuses
export function useBoardView(boardId: string | undefined) {
  return useQuery({
    queryKey: ['board-view', boardId],
    queryFn: async (): Promise<BoardView | null> => {
      if (!boardId) return null;

      // Fetch board
      const { data: board, error: boardError } = await supabase
        .from('boards')
        .select('*')
        .eq('id', boardId)
        .single();
      
      if (boardError) throw boardError;

      // Fetch workflow
      const { data: workflows, error: workflowError } = await supabase
        .from('workflows')
        .select('*')
        .eq('board_id', boardId)
        .eq('is_default', true)
        .limit(1);
      
      if (workflowError) throw workflowError;
      const workflow = workflows?.[0];
      if (!workflow) throw new Error('No workflow found for board');

      // Fetch statuses
      const { data: statuses, error: statusError } = await supabase
        .from('workflow_statuses')
        .select('*')
        .eq('workflow_id', workflow.id)
        .order('position');
      
      if (statusError) throw statusError;

      // Fetch transitions
      const { data: transitions, error: transError } = await supabase
        .from('workflow_transitions')
        .select('*')
        .eq('workflow_id', workflow.id);
      
      if (transError) throw transError;

      // Fetch tarefas for board
      const { data: tarefas, error: tarefasError } = await supabase
        .from('tarefas')
        .select('*')
        .eq('board_id', boardId)
        .order('backlog_position', { ascending: true, nullsFirst: false });
      
      if (tarefasError) throw tarefasError;

      // Build columns
      const columns: BoardColumn[] = (statuses as WorkflowStatus[]).map(status => {
        const statusTransitions = (transitions as WorkflowTransition[])
          .filter(t => t.from_status_id === status.id)
          .map(t => t.to_status_id);
        
        const columnTarefas = (tarefas || [])
          .filter(t => t.status_id === status.id)
          .map(t => ({
            ...t,
            status,
          }));

        return {
          status,
          tarefas: columnTarefas as Tarefa[],
          allowedTransitions: statusTransitions,
        };
      });

      return {
        board: board as Board,
        workflow: workflow as Workflow,
        columns,
      };
    },
    enabled: !!boardId,
  });
}

// Hook to fetch a single tarefa
export function useTarefa(tarefaId: string | undefined) {
  return useQuery({
    queryKey: ['tarefa', tarefaId],
    queryFn: async () => {
      if (!tarefaId) return null;

      const { data, error } = await supabase
        .from('tarefas')
        .select('*')
        .eq('id', tarefaId)
        .single();
      
      if (error) throw error;
      
      // Fetch status separately
      let status = null;
      if (data.status_id) {
        const { data: statusData } = await supabase
          .from('workflow_statuses')
          .select('*')
          .eq('id', data.status_id)
          .single();
        status = statusData;
      }

      return { ...data, status } as Tarefa;
    },
    enabled: !!tarefaId,
  });
}

// Hook to fetch comments for a tarefa
export function useTarefaComments(tarefaId: string | undefined) {
  return useQuery({
    queryKey: ['tarefa-comments', tarefaId],
    queryFn: async () => {
      if (!tarefaId) return [];

      const { data, error } = await supabase
        .from('tarefa_comments')
        .select('*')
        .eq('tarefa_id', tarefaId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      
      return data as TarefaComment[];
    },
    enabled: !!tarefaId,
  });
}

// Hook to fetch activity log for a tarefa
export function useTarefaActivity(tarefaId: string | undefined) {
  return useQuery({
    queryKey: ['tarefa-activity', tarefaId],
    queryFn: async () => {
      if (!tarefaId) return [];

      const { data, error } = await supabase
        .from('tarefa_activity_log')
        .select('*')
        .eq('tarefa_id', tarefaId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      return data as TarefaActivityLog[];
    },
    enabled: !!tarefaId,
  });
}

// Create board mutation
export function useCreateBoard() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateBoardInput) => {
      // Create board
      const { data: board, error: boardError } = await supabase
        .from('boards')
        .insert({
          project_id: input.project_id,
          name: input.name,
          description: input.description,
          type: input.type || 'KANBAN',
          created_by: user?.id,
        })
        .select()
        .single();
      
      if (boardError) throw boardError;

      // Create default workflow
      const { error: workflowError } = await supabase.rpc('create_default_workflow', {
        p_board_id: board.id,
      });

      if (workflowError) throw workflowError;

      return board as Board;
    },
    onSuccess: (board) => {
      queryClient.invalidateQueries({ queryKey: ['boards', board.project_id] });
      toast.success('Board criado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar board: ' + error.message);
    },
  });
}

// Create tarefa mutation
export function useCreateTarefa() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateTarefaInput) => {
      // Generate key
      const { data: key, error: keyError } = await supabase.rpc('generate_tarefa_key', {
        p_project_id: input.project_id,
      });

      if (keyError) throw keyError;

      // Get initial status if board is provided
      let statusId: string | undefined;
      if (input.board_id) {
        const { data: workflows } = await supabase
          .from('workflows')
          .select('id')
          .eq('board_id', input.board_id)
          .eq('is_default', true)
          .limit(1);

        if (workflows?.[0]) {
          const { data: statuses } = await supabase
            .from('workflow_statuses')
            .select('id')
            .eq('workflow_id', workflows[0].id)
            .eq('is_initial', true)
            .limit(1);
          
          statusId = statuses?.[0]?.id;
        }
      }

      const { data, error } = await supabase
        .from('tarefas')
        .insert({
          project_id: input.project_id,
          board_id: input.board_id,
          key,
          type: input.type || 'TASK',
          title: input.title,
          description: input.description,
          status_id: statusId,
          priority: input.priority || 'MEDIUM',
          assignee_id: input.assignee_id,
          reporter_id: user?.id,
          epic_id: input.epic_id,
          sprint_id: input.sprint_id,
          labels: input.labels || [],
          due_date: input.due_date,
          estimated_hours: input.estimated_hours,
        })
        .select()
        .single();
      
      if (error) throw error;

      // Log activity
      await supabase.from('tarefa_activity_log').insert({
        tarefa_id: data.id,
        user_id: user?.id,
        action: 'created',
        new_value: input.title,
      });

      return data as Tarefa;
    },
    onSuccess: (tarefa) => {
      queryClient.invalidateQueries({ queryKey: ['board-view', tarefa.board_id] });
      queryClient.invalidateQueries({ queryKey: ['backlog', tarefa.project_id] });
      toast.success(`Tarefa ${tarefa.key} criada!`);
    },
    onError: (error) => {
      toast.error('Erro ao criar tarefa: ' + error.message);
    },
  });
}

// Update tarefa mutation
export function useUpdateTarefa() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ tarefaId, input }: { tarefaId: string; input: UpdateTarefaInput }) => {
      // Get old values for activity log
      const { data: oldTarefa } = await supabase
        .from('tarefas')
        .select('*')
        .eq('id', tarefaId)
        .single();

      const { data, error } = await supabase
        .from('tarefas')
        .update(input)
        .eq('id', tarefaId)
        .select()
        .single();
      
      if (error) throw error;

      // Log changes
      const changes: { field: string; old: string | null; new: string | null }[] = [];
      if (input.title !== undefined && input.title !== oldTarefa?.title) {
        changes.push({ field: 'title', old: oldTarefa?.title, new: input.title });
      }
      if (input.priority !== undefined && input.priority !== oldTarefa?.priority) {
        changes.push({ field: 'priority', old: oldTarefa?.priority, new: input.priority });
      }
      if (input.assignee_id !== undefined && input.assignee_id !== oldTarefa?.assignee_id) {
        changes.push({ field: 'assignee', old: oldTarefa?.assignee_id, new: input.assignee_id });
      }

      for (const change of changes) {
        await supabase.from('tarefa_activity_log').insert({
          tarefa_id: tarefaId,
          user_id: user?.id,
          action: 'updated',
          field_name: change.field,
          old_value: change.old,
          new_value: change.new,
        });
      }

      return data as Tarefa;
    },
    onSuccess: (tarefa) => {
      queryClient.invalidateQueries({ queryKey: ['tarefa', tarefa.id] });
      queryClient.invalidateQueries({ queryKey: ['board-view', tarefa.board_id] });
      toast.success('Tarefa atualizada!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar tarefa: ' + error.message);
    },
  });
}

// Move tarefa to any status (free navigation) - with optimistic update
export function useMoveTarefa() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ tarefaId, toStatusId, boardId }: { tarefaId: string; toStatusId: string; boardId?: string }) => {
      // Get current tarefa with status
      const { data: tarefa, error: tarefaError } = await supabase
        .from('tarefas')
        .select('*, status:workflow_statuses(*)')
        .eq('id', tarefaId)
        .single();
      
      if (tarefaError) throw tarefaError;

      // Get new status name for logging
      const { data: newStatus } = await supabase
        .from('workflow_statuses')
        .select('name')
        .eq('id', toStatusId)
        .single();

      // Update status
      const { data, error } = await supabase
        .from('tarefas')
        .update({ status_id: toStatusId })
        .eq('id', tarefaId)
        .select()
        .single();
      
      if (error) throw error;

      // Log activity
      await supabase.from('tarefa_activity_log').insert({
        tarefa_id: tarefaId,
        user_id: user?.id,
        action: 'moved',
        field_name: 'status',
        old_value: tarefa.status?.name,
        new_value: newStatus?.name,
      });

      return data as Tarefa;
    },
    onMutate: async ({ tarefaId, toStatusId, boardId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['board-view', boardId] });

      // Snapshot the previous value
      const previousBoardView = queryClient.getQueryData(['board-view', boardId]);

      // Optimistically update the UI
      queryClient.setQueryData(['board-view', boardId], (old: BoardView | undefined) => {
        if (!old) return old;
        
        // Find and move the tarefa
        let movedTarefa: Tarefa | undefined;
        const newColumns = old.columns.map(col => {
          const tarefa = col.tarefas.find(t => t.id === tarefaId);
          if (tarefa) {
            movedTarefa = { ...tarefa, status_id: toStatusId };
          }
          return {
            ...col,
            tarefas: col.tarefas.filter(t => t.id !== tarefaId),
          };
        });

        // Add to new column
        if (movedTarefa) {
          const targetColumn = newColumns.find(c => c.status.id === toStatusId);
          if (targetColumn) {
            movedTarefa.status = targetColumn.status;
            targetColumn.tarefas.push(movedTarefa);
          }
        }

        return { ...old, columns: newColumns };
      });

      return { previousBoardView, boardId };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousBoardView) {
        queryClient.setQueryData(['board-view', context.boardId], context.previousBoardView);
      }
      toast.error('Erro ao mover tarefa: ' + error.message);
    },
    onSettled: (data, error, variables) => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['tarefa', variables.tarefaId] });
    },
  });
}

// Transition tarefa (change status with validation) - kept for backward compatibility
export function useTransitionTarefa() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ tarefaId, toStatusId }: { tarefaId: string; toStatusId: string }) => {
      // Get current tarefa
      const { data: tarefa, error: tarefaError } = await supabase
        .from('tarefas')
        .select('*, status:workflow_statuses(*)')
        .eq('id', tarefaId)
        .single();
      
      if (tarefaError) throw tarefaError;
      if (!tarefa.status_id) throw new Error('Tarefa não tem status atual');

      // Get workflow from status
      const { data: workflow } = await supabase
        .from('workflow_statuses')
        .select('workflow_id')
        .eq('id', tarefa.status_id)
        .single();

      if (!workflow) throw new Error('Workflow não encontrado');

      // Validate transition
      const { data: transition, error: transError } = await supabase
        .from('workflow_transitions')
        .select('*')
        .eq('workflow_id', workflow.workflow_id)
        .eq('from_status_id', tarefa.status_id)
        .eq('to_status_id', toStatusId)
        .single();
      
      if (transError || !transition) {
        throw new Error('Transição não permitida neste workflow');
      }

      // Get new status name for logging
      const { data: newStatus } = await supabase
        .from('workflow_statuses')
        .select('name')
        .eq('id', toStatusId)
        .single();

      // Update status
      const { data, error } = await supabase
        .from('tarefas')
        .update({ status_id: toStatusId })
        .eq('id', tarefaId)
        .select()
        .single();
      
      if (error) throw error;

      // Log activity
      await supabase.from('tarefa_activity_log').insert({
        tarefa_id: tarefaId,
        user_id: user?.id,
        action: 'transitioned',
        field_name: 'status',
        old_value: tarefa.status?.name,
        new_value: newStatus?.name,
      });

      return data as Tarefa;
    },
    onSuccess: (tarefa) => {
      queryClient.invalidateQueries({ queryKey: ['tarefa', tarefa.id] });
      queryClient.invalidateQueries({ queryKey: ['board-view', tarefa.board_id] });
      toast.success('Status atualizado!');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

// Create workflow status (column) - with optimistic update
export function useCreateWorkflowStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workflowId, name, color, position }: { 
      workflowId: string; 
      name: string; 
      color?: string;
      position?: number;
    }) => {
      // Get max position if not provided
      let finalPosition = position;
      if (finalPosition === undefined) {
        const { data: statuses } = await supabase
          .from('workflow_statuses')
          .select('position')
          .eq('workflow_id', workflowId)
          .order('position', { ascending: false })
          .limit(1);
        
        finalPosition = (statuses?.[0]?.position ?? 0) + 1;
      }

      const { data, error } = await supabase
        .from('workflow_statuses')
        .insert({
          workflow_id: workflowId,
          name,
          color: color || '#6b7280',
          position: finalPosition,
          is_initial: false,
          is_final: false,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board-view'] });
      toast.success('Coluna criada!');
    },
    onError: (error) => {
      toast.error('Erro ao criar coluna: ' + error.message);
    },
  });
}

// Update workflow status (column) - with optimistic update
export function useUpdateWorkflowStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ statusId, name, color }: { 
      statusId: string; 
      name?: string; 
      color?: string;
    }) => {
      const updates: Record<string, string> = {};
      if (name !== undefined) updates.name = name;
      if (color !== undefined) updates.color = color;

      const { data, error } = await supabase
        .from('workflow_statuses')
        .update(updates)
        .eq('id', statusId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onMutate: async ({ statusId, name, color }) => {
      // Cancel refetches
      await queryClient.cancelQueries({ queryKey: ['board-view'] });

      // Snapshot all board views
      const queries = queryClient.getQueriesData({ queryKey: ['board-view'] });
      
      // Optimistically update all board views
      queries.forEach(([key, data]) => {
        if (data) {
          queryClient.setQueryData(key, (old: BoardView | undefined) => {
            if (!old) return old;
            return {
              ...old,
              columns: old.columns.map(col => {
                if (col.status.id === statusId) {
                  return {
                    ...col,
                    status: {
                      ...col.status,
                      name: name ?? col.status.name,
                      color: color ?? col.status.color,
                    },
                  };
                }
                return col;
              }),
            };
          });
        }
      });

      return { previousQueries: queries };
    },
    onError: (error, variables, context) => {
      // Rollback
      context?.previousQueries.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      toast.error('Erro ao atualizar coluna: ' + error.message);
    },
    onSuccess: () => {
      toast.success('Coluna atualizada!');
    },
  });
}

// Delete workflow status (column) - with optimistic update
export function useDeleteWorkflowStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (statusId: string) => {
      // Check if there are tarefas in this status
      const { data: tarefas } = await supabase
        .from('tarefas')
        .select('id')
        .eq('status_id', statusId)
        .limit(1);
      
      if (tarefas && tarefas.length > 0) {
        throw new Error('Não é possível excluir uma coluna com tarefas. Mova as tarefas primeiro.');
      }

      // Delete transitions involving this status
      await supabase
        .from('workflow_transitions')
        .delete()
        .or(`from_status_id.eq.${statusId},to_status_id.eq.${statusId}`);

      const { error } = await supabase
        .from('workflow_statuses')
        .delete()
        .eq('id', statusId);
      
      if (error) throw error;
      return statusId;
    },
    onMutate: async (statusId) => {
      await queryClient.cancelQueries({ queryKey: ['board-view'] });

      const queries = queryClient.getQueriesData({ queryKey: ['board-view'] });
      
      // Optimistically remove the column
      queries.forEach(([key, data]) => {
        if (data) {
          queryClient.setQueryData(key, (old: BoardView | undefined) => {
            if (!old) return old;
            return {
              ...old,
              columns: old.columns.filter(col => col.status.id !== statusId),
            };
          });
        }
      });

      return { previousQueries: queries };
    },
    onError: (error, variables, context) => {
      // Rollback
      context?.previousQueries.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      toast.error(error.message);
    },
    onSuccess: () => {
      toast.success('Coluna excluída!');
    },
  });
}

// Create comment mutation
export function useCreateComment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ tarefaId, input }: { tarefaId: string; input: CreateCommentInput }) => {
      const { data, error } = await supabase
        .from('tarefa_comments')
        .insert({
          tarefa_id: tarefaId,
          content: input.content,
          created_by: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;

      // Log activity
      await supabase.from('tarefa_activity_log').insert({
        tarefa_id: tarefaId,
        user_id: user?.id,
        action: 'commented',
      });

      return data as TarefaComment;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tarefa-comments', variables.tarefaId] });
      queryClient.invalidateQueries({ queryKey: ['tarefa-activity', variables.tarefaId] });
      toast.success('Comentário adicionado!');
    },
    onError: (error) => {
      toast.error('Erro ao adicionar comentário: ' + error.message);
    },
  });
}

// Delete tarefa mutation
export function useDeleteTarefa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tarefaId: string) => {
      const { data: tarefa } = await supabase
        .from('tarefas')
        .select('board_id, project_id')
        .eq('id', tarefaId)
        .single();

      const { error } = await supabase
        .from('tarefas')
        .delete()
        .eq('id', tarefaId);
      
      if (error) throw error;
      return tarefa;
    },
    onSuccess: (tarefa) => {
      if (tarefa) {
        queryClient.invalidateQueries({ queryKey: ['board-view', tarefa.board_id] });
        queryClient.invalidateQueries({ queryKey: ['backlog', tarefa.project_id] });
      }
      toast.success('Tarefa excluída!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir tarefa: ' + error.message);
    },
  });
}
