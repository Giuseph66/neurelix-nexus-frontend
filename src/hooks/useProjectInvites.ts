import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export interface ProjectInvite {
  id: string;
  project_id: string;
  email: string;
  role: 'admin' | 'tech_lead' | 'developer' | 'viewer';
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
  role?: 'admin' | 'tech_lead' | 'developer' | 'viewer';
}

/**
 * Hook para listar convites pendentes de um projeto
 */
export function useProjectInvites(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-invites', projectId],
    queryFn: async () => {
      if (!projectId) return { invites: [] };

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Buscar convites diretamente via Supabase (respeitando RLS)
      const { data, error } = await supabase
        .from('project_invites')
        .select(`
          id,
          project_id,
          email,
          role,
          token,
          expires_at,
          accepted_at,
          created_at,
          invited_by
        `)
        .eq('project_id', projectId)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message || 'Failed to fetch invites');
      }

      return { invites: (data || []) as ProjectInvite[] };
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${FUNCTIONS_URL}/project-invites`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: input.projectId,
          email: input.email,
          role: input.role || 'developer',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create invite');
      }

      return await response.json() as { invite: ProjectInvite };
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
      const { data: { session } } = await supabase.auth.getSession();
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (session) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`${FUNCTIONS_URL}/project-invites/accept/${token}`, {
        method: 'POST',
        headers,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to accept invite');
      }

      return await response.json() as { message: string; project_id: string; requiresAuth?: boolean };
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${FUNCTIONS_URL}/project-invites/${inviteId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete invite');
      }

      return await response.json();
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

