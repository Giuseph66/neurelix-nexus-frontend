import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import type {
  Board,
  BoardType,
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
      const data = await apiFetch<Board[]>(`/boards?projectId=${projectId}`, { auth: true });
      return data;
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
      const data = await apiFetch<BoardView>(`/board-views/${boardId}`, { auth: true });
      return data;
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
      const data = await apiFetch<Tarefa>(`/tarefas/${tarefaId}`, { auth: true });
      return data;
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
      const data = await apiFetch<TarefaComment[]>(`/tarefas/${tarefaId}/comments`, { auth: true });
      return data;
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
      const data = await apiFetch<TarefaActivityLog[]>(`/tarefas/${tarefaId}/activity`, { auth: true });
      return data;
    },
    enabled: !!tarefaId,
  });
}

// Create board mutation
export function useCreateBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBoardInput) => {
      const board = await apiFetch<Board>('/boards', {
        method: 'POST',
        body: {
          project_id: input.project_id,
          name: input.name,
          description: input.description,
          type: input.type || 'KANBAN',
        },
        auth: true,
      });
      return board;
    },
    onSuccess: (board) => {
      queryClient.invalidateQueries({ queryKey: ['boards', board.project_id] });
      toast.success('Board criado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar board: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    },
  });
}

// Update board mutation
export function useUpdateBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ boardId, input }: { boardId: string; input: { name?: string; description?: string; type?: BoardType } }) => {
      const board = await apiFetch<Board>(`/boards/${boardId}`, {
        method: 'PUT',
        body: input,
        auth: true,
      });
      return board;
    },
    onSuccess: (board) => {
      queryClient.invalidateQueries({ queryKey: ['boards', board.project_id] });
      queryClient.invalidateQueries({ queryKey: ['board-view', board.id] });
      toast.success('Board atualizado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar board: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    },
  });
}

// Delete board mutation
export function useDeleteBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ boardId, projectId }: { boardId: string; projectId: string }) => {
      await apiFetch(`/boards/${boardId}`, {
        method: 'DELETE',
        auth: true,
      });
      return { boardId, projectId };
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['boards', projectId] });
      toast.success('Board deletado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao deletar board: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    },
  });
}

// Create tarefa mutation
export function useCreateTarefa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTarefaInput) => {
      const tarefa = await apiFetch<Tarefa>('/tarefas', {
        method: 'POST',
        body: {
          project_id: input.project_id,
          board_id: input.board_id,
          type: input.type || 'TASK',
          title: input.title,
          description: input.description,
          priority: input.priority || 'MEDIUM',
          assignee_id: input.assignee_id,
          epic_id: input.epic_id,
          sprint_id: input.sprint_id,
          labels: input.labels || [],
          due_date: input.due_date,
          estimated_hours: input.estimated_hours,
        },
        auth: true,
      });
      return tarefa;
    },
    onSuccess: (tarefa) => {
      queryClient.invalidateQueries({ queryKey: ['board-view', tarefa.board_id] });
      queryClient.invalidateQueries({ queryKey: ['backlog', tarefa.project_id] });
      toast.success(`Tarefa ${tarefa.key} criada!`);
    },
    onError: (error) => {
      toast.error('Erro ao criar tarefa: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    },
  });
}

// Update tarefa mutation
export function useUpdateTarefa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tarefaId, input }: { tarefaId: string; input: UpdateTarefaInput }) => {
      const tarefa = await apiFetch<Tarefa>(`/tarefas/${tarefaId}`, {
        method: 'PUT',
        body: input,
        auth: true,
        });
      return tarefa;
    },
    onSuccess: (tarefa) => {
      queryClient.invalidateQueries({ queryKey: ['tarefa', tarefa.id] });
      queryClient.invalidateQueries({ queryKey: ['board-view', tarefa.board_id] });
      toast.success('Tarefa atualizada!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar tarefa: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    },
  });
}

// Move tarefa to any status (free navigation) - with optimistic update
export function useMoveTarefa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tarefaId, toStatusId, boardId }: { tarefaId: string; toStatusId: string; boardId?: string }) => {
      const tarefa = await apiFetch<Tarefa>(`/tarefas/${tarefaId}`, {
        method: 'PUT',
        body: { status_id: toStatusId },
        auth: true,
      });
      return tarefa;
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

  return useMutation({
    mutationFn: async ({ tarefaId, toStatusId }: { tarefaId: string; toStatusId: string }) => {
      // For now, just move the tarefa (backend doesn't validate transitions yet)
      const tarefa = await apiFetch<Tarefa>(`/tarefas/${tarefaId}`, {
        method: 'PUT',
        body: { status_id: toStatusId },
        auth: true,
      });
      return tarefa;
    },
    onSuccess: (tarefa) => {
      queryClient.invalidateQueries({ queryKey: ['tarefa', tarefa.id] });
      queryClient.invalidateQueries({ queryKey: ['board-view', tarefa.board_id] });
      toast.success('Status atualizado!');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro desconhecido');
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
      const status = await apiFetch(`/workflows/${workflowId}/statuses`, {
        method: 'POST',
        body: { name, color, position },
        auth: true,
      });
      return status;
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
    mutationFn: async ({ workflowId, statusId, name, color }: { 
      workflowId: string;
      statusId: string; 
      name?: string; 
      color?: string;
    }) => {
      const status = await apiFetch(`/workflows/${workflowId}/statuses/${statusId}`, {
        method: 'PUT',
        body: { name, color },
        auth: true,
      });
      return status;
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
    mutationFn: async ({ workflowId, statusId }: { workflowId: string; statusId: string }) => {
      await apiFetch(`/workflows/${workflowId}/statuses/${statusId}`, {
        method: 'DELETE',
        auth: true,
      });
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

// Reorder workflow statuses (columns)
export function useReorderWorkflowStatuses() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workflowId, orderedStatusIds }: { workflowId: string; orderedStatusIds: string[] }) => {
      return await apiFetch<{ ok: true }>(`/workflows/${workflowId}/statuses/reorder`, {
        method: 'POST',
        body: { orderedStatusIds },
        auth: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board-view'] });
      toast.success('Colunas reordenadas!');
    },
    onError: (error) => {
      toast.error('Erro ao mover colunas: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    },
  });
}

// Create comment mutation
export function useCreateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tarefaId, input }: { tarefaId: string; input: CreateCommentInput }) => {
      const comment = await apiFetch<TarefaComment>(`/tarefas/${tarefaId}/comments`, {
        method: 'POST',
        body: { content: input.content },
        auth: true,
      });
      return comment;
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
      // Get tarefa info before deleting
      const tarefa = await apiFetch<Tarefa>(`/tarefas/${tarefaId}`, { auth: true });
      await apiFetch(`/tarefas/${tarefaId}`, {
        method: 'DELETE',
        auth: true,
      });
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
