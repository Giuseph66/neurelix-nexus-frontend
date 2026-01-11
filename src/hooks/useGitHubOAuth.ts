import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

export type GitHubConnectionStatus = {
  connected: boolean;
  username: string | null;
  installationId: string | null;
};

/**
 * Hook para iniciar OAuth GitHub
 */
export function useStartGitHubOAuth() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (projectId: string) => {
      if (!user) throw new Error('Not authenticated');

      return await apiFetch('/functions/v1/github-oauth/start', {
        method: 'POST',
        body: { projectId },
      });
    },
    onSuccess: (data: any) => {
      if (data?.authorizeUrl) {
        // Redirect to GitHub
        window.location.href = data.authorizeUrl;
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao iniciar conexão GitHub');
    },
  });
}

/**
 * Hook para verificar status da conexão GitHub
 */
export function useGitHubConnection(projectId: string | undefined) {
  return useQuery({
    queryKey: ['github-connection', projectId],
    queryFn: async () => {
      if (!projectId) return null;

      return await apiFetch<GitHubConnectionStatus>(`/functions/v1/github-oauth/connection?projectId=${projectId}`);
    },
    enabled: !!projectId,
  });
}

/**
 * Hook para revogar conexão GitHub
 */
export function useRevokeGitHubConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectId: string) => {
      return await apiFetch('/functions/v1/github-oauth/connection/revoke', {
        method: 'POST',
        body: { projectId },
      });
    },
    onSuccess: (data, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['github-connection', projectId] });
      queryClient.invalidateQueries({ queryKey: ['repos', projectId] });
      queryClient.invalidateQueries({ queryKey: ['selected-repos', projectId] });
      queryClient.invalidateQueries({ queryKey: ['available-repos', projectId] });
      toast.success('Conexão GitHub desconectada com sucesso');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao revogar conexão');
    },
  });
}

