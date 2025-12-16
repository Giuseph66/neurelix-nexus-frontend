import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Tarefa, Sprint } from '@/types/tarefas';

// Hook to fetch backlog items (tarefas without sprint or board-specific)
export function useBacklog(projectId: string | undefined) {
  return useQuery({
    queryKey: ['backlog', projectId],
    queryFn: async () => {
      if (!projectId) return { tarefas: [], epics: [], sprints: [] };

      // Fetch all tarefas for project, sorted by backlog position
      const { data: tarefas, error: tarefasError } = await supabase
        .from('tarefas')
        .select('*')
        .eq('project_id', projectId)
        .order('backlog_position', { ascending: true, nullsFirst: false });
      
      if (tarefasError) throw tarefasError;

      // Fetch sprints
      const { data: sprints, error: sprintsError } = await supabase
        .from('sprints')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      
      if (sprintsError) throw sprintsError;

      // Separate epics from regular tarefas
      const epics = (tarefas || []).filter(t => t.type === 'EPIC');
      const regularTarefas = (tarefas || []).filter(t => t.type !== 'EPIC');

      return {
        tarefas: regularTarefas as Tarefa[],
        epics: epics as Tarefa[],
        sprints: (sprints || []) as Sprint[],
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

      const { data, error } = await supabase
        .from('tarefas')
        .select('*')
        .eq('project_id', projectId)
        .eq('type', 'EPIC')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Tarefa[];
    },
    enabled: !!projectId,
  });
}

// Reorder backlog items
export function useReorderBacklog() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ projectId, orderedIds }: { projectId: string; orderedIds: string[] }) => {
      // Update each tarefa with new position
      const updates = orderedIds.map((id, index) => 
        supabase
          .from('tarefas')
          .update({ backlog_position: index })
          .eq('id', id)
      );

      await Promise.all(updates);

      // Log activity for reorder
      if (user?.id) {
        await supabase.from('tarefa_activity_log').insert({
          tarefa_id: orderedIds[0],
          user_id: user.id,
          action: 'reordered',
          metadata: { new_order: orderedIds },
        });
      }

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
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ tarefaId, sprintId, projectId }: { tarefaId: string; sprintId: string | null; projectId: string }) => {
      const { data, error } = await supabase
        .from('tarefas')
        .update({ sprint_id: sprintId })
        .eq('id', tarefaId)
        .select()
        .single();
      
      if (error) throw error;

      // Log activity
      if (user?.id) {
        await supabase.from('tarefa_activity_log').insert({
          tarefa_id: tarefaId,
          user_id: user.id,
          action: 'sprint_changed',
          field_name: 'sprint',
          new_value: sprintId,
        });
      }

      return { tarefa: data, projectId };
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
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ tarefaId, epicId, projectId }: { tarefaId: string; epicId: string | null; projectId: string }) => {
      const { data, error } = await supabase
        .from('tarefas')
        .update({ epic_id: epicId })
        .eq('id', tarefaId)
        .select()
        .single();
      
      if (error) throw error;

      // Log activity
      if (user?.id) {
        await supabase.from('tarefa_activity_log').insert({
          tarefa_id: tarefaId,
          user_id: user.id,
          action: 'epic_changed',
          field_name: 'epic',
          new_value: epicId,
        });
      }

      return { tarefa: data, projectId };
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
  const { user } = useAuth();

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
      const { data, error } = await supabase
        .from('sprints')
        .insert({
          project_id: projectId,
          board_id: boardId,
          name,
          goal,
          start_date: startDate,
          end_date: endDate,
          state: 'PLANNED',
          created_by: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return { sprint: data as Sprint, projectId };
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
      // First close any active sprint
      await supabase
        .from('sprints')
        .update({ state: 'DONE' })
        .eq('project_id', projectId)
        .eq('state', 'ACTIVE');

      const { data, error } = await supabase
        .from('sprints')
        .update({ 
          state: 'ACTIVE',
          start_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', sprintId)
        .select()
        .single();
      
      if (error) throw error;
      return { sprint: data as Sprint, projectId };
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
      // Mark sprint as done
      const { data: sprint, error } = await supabase
        .from('sprints')
        .update({ 
          state: 'DONE',
          end_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', sprintId)
        .select()
        .single();
      
      if (error) throw error;

      // Move incomplete tarefas back to backlog (remove sprint_id)
      // Get tarefas in sprint that are not in final status
      const { data: workflows } = await supabase
        .from('workflows')
        .select('id');
      
      if (workflows && workflows.length > 0) {
        const workflowIds = workflows.map(w => w.id);
        
        const { data: finalStatuses } = await supabase
          .from('workflow_statuses')
          .select('id')
          .in('workflow_id', workflowIds)
          .eq('is_final', true);
        
        const finalStatusIds = (finalStatuses || []).map(s => s.id);

        // Update tarefas that are not done
        await supabase
          .from('tarefas')
          .update({ sprint_id: null })
          .eq('sprint_id', sprintId)
          .not('status_id', 'in', `(${finalStatusIds.join(',')})`);
      }

      return { sprint: sprint as Sprint, projectId };
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
