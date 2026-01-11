import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import type { Tarefa, Sprint } from '@/types/tarefas';

// Hook to fetch backlog items (tarefas without sprint or board-specific)
export function useBacklog(projectId: string | undefined) {
  return useQuery({
    queryKey: ['backlog', projectId],
    queryFn: async () => {
      if (!projectId) return { tarefas: [], epics: [], sprints: [] };

      // Fetch all tarefas for project
      const tarefas = await apiFetch<Tarefa[]>(`/tarefas?projectId=${projectId}`, { auth: true });

      // Fetch sprints for project
      const sprints = await apiFetch<Sprint[]>(`/sprints?projectId=${projectId}`, { auth: true });

      // Separate epics from regular tarefas
      const epics = tarefas.filter(t => t.type === 'EPIC');
      const regularTarefas = tarefas.filter(t => t.type !== 'EPIC');

      return {
        tarefas: regularTarefas,
        epics,
        sprints,
      };
    },
    enabled: !!projectId,
  });
}

// Hook to fetch epics for a project
export function useEpics(projectId: string | undefined) {
  return useQuery({
    queryKey: ['epics', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const tarefas = await apiFetch<Tarefa[]>(`/tarefas?projectId=${projectId}`, { auth: true });
      return tarefas.filter(t => t.type === 'EPIC');
    },
    enabled: !!projectId,
  });
}

// Reorder backlog items
export function useReorderBacklog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, orderedIds }: { projectId: string; orderedIds: string[] }) => {
      // Update each tarefa with new position
      await Promise.all(
        orderedIds.map((id, index) =>
          apiFetch(`/tarefas/${id}`, {
            method: 'PUT',
            body: { backlog_position: index },
            auth: true,
          })
        )
      );

      return orderedIds;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['backlog', variables.projectId] });
    },
    onError: (error) => {
      toast.error('Erro ao reordenar backlog: ' + error.message);
    },
  });
}

// Assign tarefa to sprint
export function useAssignToSprint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tarefaId, sprintId, projectId }: { tarefaId: string; sprintId: string | null; projectId: string }) => {
      const tarefa = await apiFetch<Tarefa>(`/tarefas/${tarefaId}`, {
        method: 'PUT',
        body: { sprint_id: sprintId },
        auth: true,
      });

      return { tarefa, projectId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['backlog', result.projectId] });
      queryClient.invalidateQueries({ queryKey: ['board-view'] });
      toast.success('Tarefa movida!');
    },
    onError: (error) => {
      toast.error('Erro ao mover tarefa: ' + error.message);
    },
  });
}

// Assign tarefa to epic
export function useAssignToEpic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tarefaId, epicId, projectId }: { tarefaId: string; epicId: string | null; projectId: string }) => {
      const tarefa = await apiFetch<Tarefa>(`/tarefas/${tarefaId}`, {
        method: 'PUT',
        body: { epic_id: epicId },
        auth: true,
      });

      return { tarefa, projectId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['backlog', result.projectId] });
      queryClient.invalidateQueries({ queryKey: ['epics', result.projectId] });
      toast.success('Épico atualizado!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar épico: ' + error.message);
    },
  });
}

// Create sprint
export function useCreateSprint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      projectId, 
      boardId,
      name, 
      goal, 
      startDate, 
      endDate 
    }: { 
      projectId: string; 
      boardId?: string;
      name: string; 
      goal?: string; 
      startDate?: string; 
      endDate?: string;
    }) => {
      const sprint = await apiFetch<Sprint>('/sprints', {
        method: 'POST',
        body: {
          project_id: projectId,
          board_id: boardId,
          name,
          goal,
          start_date: startDate,
          end_date: endDate,
        },
        auth: true,
      });
      
      return { sprint, projectId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['backlog', result.projectId] });
      toast.success('Sprint criada!');
    },
    onError: (error) => {
      toast.error('Erro ao criar sprint: ' + error.message);
    },
  });
}

// Start sprint
export function useStartSprint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sprintId, projectId }: { sprintId: string; projectId: string }) => {
      const sprint = await apiFetch<Sprint>(`/sprints/${sprintId}/start`, {
        method: 'POST',
        auth: true,
      });
      
      return { sprint, projectId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['backlog', result.projectId] });
      toast.success('Sprint iniciada!');
    },
    onError: (error) => {
      toast.error('Erro ao iniciar sprint: ' + error.message);
    },
  });
}

// Complete sprint
export function useCompleteSprint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sprintId, projectId }: { sprintId: string; projectId: string }) => {
      const sprint = await apiFetch<Sprint>(`/sprints/${sprintId}/complete`, {
        method: 'POST',
        auth: true,
      });

      return { sprint, projectId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['backlog', result.projectId] });
      toast.success('Sprint finalizada! Tarefas incompletas voltaram ao backlog.');
    },
    onError: (error) => {
      toast.error('Erro ao finalizar sprint: ' + error.message);
    },
  });
}
