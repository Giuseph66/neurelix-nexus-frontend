import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

export interface ProjectInvite {
  id: string;
  project_id: string;
  email: string;
  role: 'admin' | 'tech_lead' | 'developer' | 'viewer' | 'custom';
  custom_role_name?: string | null;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  invited_by: string;
  profiles?: {
    full_name: string | null;
  } | null;
}

export interface CreateInviteInput {
  projectId: string;
  email: string;
  role?: 'admin' | 'tech_lead' | 'developer' | 'viewer' | 'custom';
  custom_role_name?: string | null;
}

/**
 * Hook para listar convites pendentes de um projeto
 */
export function useProjectInvites(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-invites', projectId],
    queryFn: async () => {
      if (!projectId) return { invites: [] };

      return await apiFetch<{ invites: ProjectInvite[] }>(`/functions/v1/project-invites?projectId=${projectId}`);
    },
    enabled: !!projectId,
  });
}

/**
 * Hook para criar convite
 */
export function useCreateInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateInviteInput) => {
      return await apiFetch<{ invite: ProjectInvite }>('/functions/v1/project-invites', {
        method: 'POST',
        body: {
          projectId: input.projectId,
          email: input.email,
          role: input.role || 'developer',
          custom_role_name: input.custom_role_name || null,
        },
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-invites', variables.projectId] });
      toast.success(`Convite enviado para ${variables.email}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao criar convite');
    },
  });
}

/**
 * Hook para aceitar convite
 */
export function useAcceptInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (token: string) => {
      return await apiFetch<{ message: string; project_id: string; requiresAuth?: boolean }>(
        `/functions/v1/project-invites/accept/${token}`,
        {
        method: 'POST',
          // If the user is logged in, apiFetch will attach the JWT automatically.
          // If not, it's still fine (public endpoint returns requiresAuth).
        }
      );
    },
    onSuccess: (data) => {
      if (data.requiresAuth) {
        toast.info('Por favor, faça login para aceitar o convite');
      } else {
        queryClient.invalidateQueries({ queryKey: ['project-members'] });
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        toast.success('Convite aceito com sucesso!');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao aceitar convite');
    },
  });
}

/**
 * Hook para cancelar/deletar convite
 */
export function useDeleteInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ inviteId, projectId }: { inviteId: string; projectId: string }) => {
      return await apiFetch(`/functions/v1/project-invites/${inviteId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-invites', variables.projectId] });
      toast.success('Convite cancelado');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao cancelar convite');
    },
  });
}

