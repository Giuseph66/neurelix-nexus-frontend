import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { ProviderConnection } from '@/types/codigo';

/**
 * Hook para listar conexões Git de um projeto
 */
export function useConnections(projectId: string | undefined) {
  return useQuery({
    queryKey: ['git-connections', projectId],
    queryFn: async () => {
      if (!projectId) return { connections: [] };

      return await apiFetch<{ connections: ProviderConnection[] }>(
        `/functions/v1/git-connect/connections?projectId=${projectId}`
      );
    },
    enabled: !!projectId,
  });
}

/**
 * Hook para iniciar conexão Git
 */
export function useConnectGit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, provider = 'github' }: { projectId: string; provider?: 'github' | 'bitbucket' }) => {
      return await apiFetch<{ url: string }>(`/functions/v1/git-connect/start`, {
        method: 'POST',
        body: { projectId, provider },
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['git-connections', variables.projectId] });
      toast.success('Redirecionando para GitHub...');
      // Redirect to GitHub App installation
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao conectar Git');
    },
  });
}

/**
 * Hook para processar callback de conexão
 */
export function useProcessCallback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      installationId,
      provider = 'github',
      ownerType,
      ownerName,
    }: {
      projectId: string;
      installationId: string;
      provider?: 'github' | 'bitbucket';
      ownerType?: 'user' | 'org';
      ownerName?: string;
    }) => {
      return await apiFetch(`/functions/v1/git-connect/callback`, {
        method: 'POST',
        body: {
          projectId,
          installationId,
          provider,
          ownerType,
          ownerName,
        },
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['git-connections', variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ['repos', variables.projectId] });
      toast.success('Conexão estabelecida com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao processar conexão');
    },
  });
}

/**
 * Hook para sincronizar repositórios
 */
export function useSyncRepos() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ connectionId, repoId }: { connectionId?: string; repoId?: string }) => {
      const params = new URLSearchParams();
      if (connectionId) params.append('connectionId', connectionId);
      if (repoId) params.append('repoId', repoId);

      return await apiFetch(`/functions/v1/git-connect/sync?${params.toString()}`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repos'] });
      queryClient.invalidateQueries({ queryKey: ['git-connections'] });
      toast.success('Sincronização iniciada');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao sincronizar');
    },
  });
}

/**
 * Hook para revogar conexão
 */
export function useRevokeConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionId: string) => {
      return await apiFetch(`/functions/v1/git-connect/connections/${connectionId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git-connections'] });
      toast.success('Conexão revogada');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao revogar conexão');
    },
  });
}


