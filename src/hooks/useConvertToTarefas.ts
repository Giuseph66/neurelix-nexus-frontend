import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Tarefa, TarefaType, TarefaPriority } from '@/types/tarefas';

interface ConvertToTarefasInput {
  projectId: string;
  boardId?: string;
  epicId?: string;
  sprintId?: string;
  whiteboardId: string;
  items: Array<{
    nodeId: string;
    title: string;
    description?: string;
    type?: TarefaType;
    priority?: TarefaPriority;
  }>;
  areaBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  snapshotPreview?: string;
}

export function useConvertToTarefas() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: ConvertToTarefasInput) => {
      const createdTarefas: Tarefa[] = [];

      // Get initial status if board is provided
      let statusId: string | undefined;
      if (input.boardId) {
        const { data: workflows } = await supabase
          .from('workflows')
          .select('id')
          .eq('board_id', input.boardId)
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

      for (const item of input.items) {
        // Generate key
        const { data: key, error: keyError } = await supabase.rpc('generate_tarefa_key', {
          p_project_id: input.projectId,
        });

        if (keyError) throw keyError;

        // Create tarefa
        const { data: tarefa, error: tarefaError } = await supabase
          .from('tarefas')
          .insert({
            project_id: input.projectId,
            board_id: input.boardId,
            key,
            type: item.type || 'TASK',
            title: item.title,
            description: item.description,
            status_id: statusId,
            priority: item.priority || 'MEDIUM',
            reporter_id: user?.id,
            epic_id: input.epicId,
            sprint_id: input.sprintId,
            labels: [],
          })
          .select()
          .single();
        
        if (tarefaError) throw tarefaError;

        // Create whiteboard origin link
        const { error: originError } = await supabase
          .from('tarefa_whiteboard_origin')
          .insert({
            tarefa_id: tarefa.id,
            whiteboard_id: input.whiteboardId,
            node_ids: [item.nodeId],
            area_bounds: input.areaBounds,
            snapshot_title: item.title,
            snapshot_preview: input.snapshotPreview,
          });

        if (originError) throw originError;

        // Log activity
        await supabase.from('tarefa_activity_log').insert({
          tarefa_id: tarefa.id,
          user_id: user?.id,
          action: 'created_from_whiteboard',
          metadata: {
            whiteboard_id: input.whiteboardId,
            node_id: item.nodeId,
          },
        });

        createdTarefas.push(tarefa as Tarefa);
      }

      return {
        tarefas: createdTarefas,
        projectId: input.projectId,
        boardId: input.boardId,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['backlog', result.projectId] });
      if (result.boardId) {
        queryClient.invalidateQueries({ queryKey: ['board-view', result.boardId] });
      }
      toast.success(`${result.tarefas.length} tarefa(s) criada(s) do Quadro Branco!`);
    },
    onError: (error) => {
      toast.error('Erro ao converter para tarefas: ' + error.message);
    },
  });
}

// Hook to fetch whiteboard origin for a tarefa
export function useTarefaWhiteboardOrigin(tarefaId: string | undefined) {
  const queryClient = useQueryClient();
  
  return {
    data: null, // Will be fetched inline when needed
    fetchOrigin: async () => {
      if (!tarefaId) return null;
      
      const { data, error } = await supabase
        .from('tarefa_whiteboard_origin')
        .select('*')
        .eq('tarefa_id', tarefaId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  };
}
