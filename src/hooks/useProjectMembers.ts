import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type ProjectMemberDto = {
  id: string;
  role: string;
  user_id: string;
  created_at: string;
  profiles: { id?: string; full_name?: string; avatar_url?: string } | null;
};

export function useProjectMembers(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => {
      if (!projectId) return [] as ProjectMemberDto[];
      const data = await apiFetch<{ members: ProjectMemberDto[] }>(`/projects/${projectId}/members`, { auth: true });
      return data.members || [];
    },
    enabled: !!projectId,
  });
}


