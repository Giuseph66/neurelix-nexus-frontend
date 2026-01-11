import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface TarefaGitLink {
  id: string;
  branch: string | null;
  commitSha: string | null;
  prNumber: number | null;
  url: string | null;
  autoLinked: boolean;
  repo: {
    id: string;
    fullName: string;
    url: string;
  } | null;
  pr: {
    id: string;
    number: number;
    title: string;
    state: string;
    url: string;
  } | null;
}

export interface TarefaGitLinksData {
  links: TarefaGitLink[];
  whiteboardOrigin: {
    whiteboardId: string;
    nodeIds: string[];
  } | null;
}

/**
 * Hook para buscar links Git de uma tarefa
 */
export function useTarefaGitLinks(tarefaId: string | undefined) {
  return useQuery<TarefaGitLinksData>({
    queryKey: ['tarefa-git-links', tarefaId],
    queryFn: async () => {
      if (!tarefaId) throw new Error('Tarefa ID is required');

      try {
        return await apiFetch<TarefaGitLinksData>(`/functions/v1/git-links/tarefas/${tarefaId}`);
      } catch (error: any) {
        // Se for 404, retorna dados vazios (é normal não ter links Git)
        if (error?.status === 404 || error?.response?.status === 404) {
          return {
            links: [],
            whiteboardOrigin: null,
          };
        }
        // Para outros erros, propaga
        throw error;
      }
    },
    enabled: !!tarefaId,
    retry: false, // Não tenta novamente em caso de erro
    refetchOnWindowFocus: false, // Não refaz a busca ao focar na janela
  });
}

