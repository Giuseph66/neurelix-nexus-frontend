import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Repo, RepoOverview, TreeEntry, BlobContent, Branch, Commit } from '@/types/codigo';

/**
 * Hook para listar repositórios de um projeto
 */
export function useRepos(projectId: string | undefined) {
  return useQuery({
    queryKey: ['repos', projectId],
    queryFn: async () => {
      if (!projectId) return { repos: [] };

      const data = await apiFetch(`/functions/v1/git-repos?projectId=${projectId}`, { auth: true });
      return data as { repos: Repo[] };
    },
    enabled: !!projectId,
  });
}

/**
 * Hook para obter overview de um repositório
 */
export function useRepoOverview(repoId: string | undefined) {
  return useQuery({
    queryKey: ['repo-overview', repoId],
    queryFn: async () => {
      if (!repoId) return null;

      const data = await apiFetch(`/functions/v1/git-repos/${repoId}/overview`, { auth: true });
      return data as RepoOverview;
    },
    enabled: !!repoId,
  });
}

/**
 * Hook para obter árvore de arquivos
 */
export function useRepoTree(repoId: string | undefined, ref: string = 'main', path: string = '') {
  return useQuery({
    queryKey: ['repo-tree', repoId, ref, path],
    queryFn: async () => {
      if (!repoId) return { tree: [] };

      const params = new URLSearchParams();
      params.append('ref', ref);
      if (path) params.append('path', path);

      const data = await apiFetch(`/functions/v1/github-code/repos/${repoId}/tree?${params.toString()}`, { auth: true });
      return data as { tree: TreeEntry[] };
    },
    enabled: !!repoId,
  });
}

/**
 * Hook para obter conteúdo de arquivo (blob)
 */
export function useRepoBlob(repoId: string | undefined, ref: string = 'main', path: string = '') {
  return useQuery({
    queryKey: ['repo-blob', repoId, ref, path],
    queryFn: async () => {
      if (!repoId || !path) return null;

      const params = new URLSearchParams();
      params.append('ref', ref);
      params.append('path', path);

      const data = await apiFetch(`/functions/v1/github-code/repos/${repoId}/blob?${params.toString()}`, { auth: true });
      return data as BlobContent;
    },
    enabled: !!repoId && !!path,
  });
}

/**
 * Hook para listar branches
 */
export function useBranches(repoId: string | undefined) {
  return useQuery({
    queryKey: ['branches', repoId],
    queryFn: async () => {
      if (!repoId) return { branches: [] };

      const data = await apiFetch(`/functions/v1/github-code/repos/${repoId}/branches`, { auth: true });
      return data as { branches: Branch[] };
    },
    enabled: !!repoId,
  });
}

/**
 * Hook para listar commits
 */
export function useCommits(repoId: string | undefined, ref: string = 'main', page: number = 1, limit: number = 30) {
  return useQuery({
    queryKey: ['commits', repoId, ref, page, limit],
    queryFn: async () => {
      if (!repoId) return { commits: [], page: 1, limit: 30 };

      const params = new URLSearchParams();
      params.append('ref', ref);
      params.append('page', page.toString());
      params.append('limit', limit.toString());

      const data = await apiFetch(`/functions/v1/github-code/repos/${repoId}/commits?${params.toString()}`, { auth: true });
      return data as { commits: Commit[]; page: number; limit: number };
    },
    enabled: !!repoId,
  });
}

/**
 * Hook para obter detalhe de commit
 */
export function useCommitDetail(repoId: string | undefined, sha: string | undefined) {
  return useQuery({
    queryKey: ['commit-detail', repoId, sha],
    queryFn: async () => {
      if (!repoId || !sha) return null;

      const data = await apiFetch(`/functions/v1/github-code/repos/${repoId}/commits/${sha}`, { auth: true });
      return data;
    },
    enabled: !!repoId && !!sha,
  });
}


