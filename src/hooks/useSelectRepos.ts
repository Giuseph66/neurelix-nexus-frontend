import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

export interface AvailableRepo {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  description: string;
  url: string;
  updatedAt: string;
  selected: boolean;
}

/**
 * Hook para listar repositórios disponíveis
 */
export function useAvailableRepos(
  projectId: string | undefined,
  filters?: { org?: string; search?: string }
) {
  return useQuery({
    queryKey: ['available-repos', projectId, filters],
    queryFn: async () => {
      if (!projectId) return { repos: [], orgs: [] };

      const params = new URLSearchParams();
      params.append('projectId', projectId);
      if (filters?.org) params.append('org', filters.org);
      if (filters?.search) params.append('search', filters.search);

      const data = await apiFetch(`/functions/v1/github-repos/available?${params.toString()}`, { auth: true });
      return data as { repos: AvailableRepo[]; orgs: string[]; nextCursor?: string };
    },
    enabled: !!projectId,
  });
}

/**
 * Hook para selecionar repositórios
 */
export function useSelectRepos() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      selectedFullNames,
    }: {
      projectId: string;
      selectedFullNames: string[];
    }) => {
      const data = await apiFetch('/functions/v1/github-repos/select', {
        method: 'POST',
        body: { projectId, selectedFullNames },
        auth: true,
      });
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['available-repos', variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ['selected-repos', variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ['repos', variables.projectId] });
      toast.success(`${data.selected?.length || 0} repositórios selecionados!`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao selecionar repositórios');
    },
  });
}

/**
 * Hook para listar repositórios selecionados
 */
export function useSelectedRepos(projectId: string | undefined) {
  return useQuery({
    queryKey: ['selected-repos', projectId],
    queryFn: async () => {
      if (!projectId) return { repos: [] };

      const data = await apiFetch(`/functions/v1/github-repos/selected?projectId=${projectId}`, { auth: true });
      return data as { repos: any[] };
    },
    enabled: !!projectId,
  });
}

