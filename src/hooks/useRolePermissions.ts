import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

export interface CustomRole {
  id: string;
  role_name: string;
  permissions: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomRoleInput {
  projectId: string;
  role_name: string;
  permissions: Record<string, boolean>;
}

export interface UpdateCustomRoleInput {
  projectId: string;
  roleName: string;
  role_name?: string;
  permissions?: Record<string, boolean>;
}

/**
 * Hook para listar roles customizados de um projeto
 */
export function useCustomRoles(projectId: string | undefined) {
  return useQuery({
    queryKey: ['custom-roles', projectId],
    queryFn: async () => {
      if (!projectId) return { roles: [] };
      return await apiFetch<{ roles: CustomRole[] }>(`/projects/${projectId}/roles`, { auth: true });
    },
    enabled: !!projectId,
  });
}

/**
 * Hook para obter um role customizado específico
 */
export function useCustomRole(projectId: string | undefined, roleName: string | undefined) {
  return useQuery({
    queryKey: ['custom-role', projectId, roleName],
    queryFn: async () => {
      if (!projectId || !roleName) return null;
      const encodedRoleName = encodeURIComponent(roleName);
      return await apiFetch<{ role: CustomRole }>(`/projects/${projectId}/roles/${encodedRoleName}`, { auth: true });
    },
    enabled: !!projectId && !!roleName,
  });
}

/**
 * Hook para criar um role customizado
 */
export function useCreateCustomRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCustomRoleInput) => {
      return await apiFetch<{ role: CustomRole }>(`/projects/${input.projectId}/roles`, {
        method: 'POST',
        body: {
          role_name: input.role_name,
          permissions: input.permissions,
        },
        auth: true,
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['custom-roles', variables.projectId] });
      toast.success(`Role "${variables.role_name}" criado com sucesso`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao criar role customizado');
    },
  });
}

/**
 * Hook para atualizar um role customizado
 */
export function useUpdateCustomRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateCustomRoleInput) => {
      const encodedRoleName = encodeURIComponent(input.roleName);
      return await apiFetch<{ role: CustomRole }>(`/projects/${input.projectId}/roles/${encodedRoleName}`, {
        method: 'PUT',
        body: {
          role_name: input.role_name,
          permissions: input.permissions,
        },
        auth: true,
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['custom-roles', variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ['custom-role', variables.projectId, variables.roleName] });
      toast.success('Role atualizado com sucesso');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao atualizar role customizado');
    },
  });
}

/**
 * Hook para deletar um role customizado
 */
export function useDeleteCustomRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, roleName }: { projectId: string; roleName: string }) => {
      const encodedRoleName = encodeURIComponent(roleName);
      return await apiFetch(`/projects/${projectId}/roles/${encodedRoleName}`, {
        method: 'DELETE',
        auth: true,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['custom-roles', variables.projectId] });
      toast.success('Role deletado com sucesso');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao deletar role customizado');
    },
  });
}

