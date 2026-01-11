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

      return await apiFetch<TarefaGitLinksData>(`/functions/v1/git-links/tarefas/${tarefaId}`);
    },
    enabled: !!tarefaId,
  });
}

