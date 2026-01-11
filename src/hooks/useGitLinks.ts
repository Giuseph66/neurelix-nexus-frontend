import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { LinkTarefaInput, CreateBranchFromTarefaInput } from '@/types/codigo';

/**
 * Hook para obter vínculos Git de uma tarefa
 */
export function useTarefaGitLinks(tarefaId: string | undefined) {
  return useQuery({
    queryKey: ['tarefa-git-links', tarefaId],
    queryFn: async () => {
      if (!tarefaId) return null;

      return await apiFetch(`/functions/v1/git-links/tarefas/${tarefaId}`);
    },
    enabled: !!tarefaId,
  });
}

/**
 * Hook para criar/atualizar vínculo tarefa ↔ código
 */
export function useLinkTarefa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: LinkTarefaInput) => {
      return await apiFetch(`/functions/v1/git-links`, {
        method: 'POST',
        body: input,
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tarefa-git-links', variables.tarefaId] });
      queryClient.invalidateQueries({ queryKey: ['tarefas'] });
      toast.success('Vínculo criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao vincular tarefa');
    },
  });
}

/**
 * Hook para criar branch a partir de tarefa
 */
export function useCreateBranchFromTarefa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBranchFromTarefaInput) => {
      return await apiFetch(`/functions/v1/git-links/create-branch`, {
        method: 'POST',
        body: input,
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tarefa-git-links', variables.tarefaId] });
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      toast.success('Branch criada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao criar branch');
    },
  });
}


