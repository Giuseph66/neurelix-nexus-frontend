import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

export type ApiProvider = 'GEMINI' | 'OPENAI';

export interface ApiKey {
  id: string;
  project_id: string;
  user_id: string;
  provider: ApiProvider;
  api_key_preview: string;
  name?: string;
  timeout_seconds: number;
  is_active: boolean;
  last_used_at?: string;
  error_count: number;
  last_error_at?: string;
  model_primary?: string;
  model_fallback?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateApiKeyInput {
  project_id: string;
  provider: ApiProvider;
  api_key: string;
  name?: string;
  timeout_seconds?: number;
  model_primary?: string;
  model_fallback?: string;
}

export interface UpdateApiKeyInput {
  api_key?: string;
  name?: string;
  timeout_seconds?: number;
  is_active?: boolean;
  model_primary?: string;
  model_fallback?: string;
}

// Hook to fetch API keys for a project
export function useApiKeys(projectId: string | undefined) {
  return useQuery({
    queryKey: ['api-keys', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const data = await apiFetch<ApiKey[]>(`/api-keys?projectId=${projectId}`, { auth: true });
      return data;
    },
    enabled: !!projectId,
  });
}

// Create API key mutation
export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateApiKeyInput) => {
      const apiKey = await apiFetch<ApiKey>('/api-keys', {
        method: 'POST',
        body: input,
        auth: true,
      });
      return apiKey;
    },
    onSuccess: (apiKey) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', apiKey.project_id] });
      toast.success('Chave de API criada com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar chave de API: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    },
  });
}

// Update API key mutation
export function useUpdateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ keyId, input }: { keyId: string; input: UpdateApiKeyInput }) => {
      const apiKey = await apiFetch<ApiKey>(`/api-keys/${keyId}`, {
        method: 'PUT',
        body: input,
        auth: true,
      });
      return apiKey;
    },
    onSuccess: (apiKey) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', apiKey.project_id] });
      toast.success('Chave de API atualizada com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar chave de API: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    },
  });
}

// Delete API key mutation
export function useDeleteApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ keyId, projectId }: { keyId: string; projectId: string }) => {
      await apiFetch(`/api-keys/${keyId}`, {
        method: 'DELETE',
        auth: true,
      });
      return { keyId, projectId };
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', projectId] });
      toast.success('Chave de API deletada com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao deletar chave de API: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    },
  });
}

// Reset errors mutation
export function useResetApiKeyErrors() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ keyId, projectId }: { keyId: string; projectId: string }) => {
      const apiKey = await apiFetch<ApiKey>(`/api-keys/${keyId}/reset-errors`, {
        method: 'POST',
        auth: true,
      });
      return { apiKey, projectId };
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', projectId] });
      toast.success('Contador de erros resetado!');
    },
    onError: (error) => {
      toast.error('Erro ao resetar contador: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    },
  });
}

