import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PullRequest, CreatePRInput, SubmitReviewInput, MergePRInput } from '@/types/codigo';
import { apiFetch } from '@/lib/api';

/**
 * Hook para listar Pull Requests
 */
export function usePRs(repoId: string | undefined, filters?: { state?: string; page?: number; author?: string; reviewer?: string; search?: string }) {
  return useQuery({
    queryKey: ['prs', repoId, filters],
    queryFn: async () => {
      if (!repoId) return { prs: [], page: 1 };

      const params = new URLSearchParams();
      if (filters?.state) params.append('state', filters.state);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.author) params.append('author', filters.author);
      if (filters?.reviewer) params.append('reviewer', filters.reviewer);
      if (filters?.page) params.append('page', filters.page.toString());

      return await apiFetch<{ prs: PullRequest[]; page: number }>(
        `/functions/v1/github-pulls/repos/${repoId}/pulls?${params.toString()}`
      );
    },
    enabled: !!repoId,
  });
}

/**
 * Hook para obter detalhe de um PR por repoId e número
 */
export function usePR(repoId: string | undefined, prNumber: number | undefined) {
  return useQuery({
    queryKey: ['pr', repoId, prNumber],
    queryFn: async () => {
      if (!repoId || !prNumber) return null;

      return await apiFetch<{ pr: PullRequest; linked_tarefas: unknown[] }>(
        `/functions/v1/github-pulls/pulls/${repoId}/${prNumber}`
      );
    },
    enabled: !!repoId && !!prNumber,
  });
}

/**
 * Hook para submeter review
 */
export function useSubmitReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ repoId, prNumber, ...input }: { repoId: string; prNumber: number } & SubmitReviewInput) => {
      return await apiFetch(`/functions/v1/github-pulls/repos/${repoId}/pulls/${prNumber}/reviews`, {
        method: 'POST',
        body: input,
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pr', variables.repoId, variables.prNumber] });
      queryClient.invalidateQueries({ queryKey: ['prs', variables.repoId] });
      toast.success('Review submetido com sucesso!');
    },
    onError: (error: any) => {
      // Se for ApiError, mostrar a mensagem do backend (que vem do GitHub)
      const message = error?.payload?.error || error?.message || 'Erro ao submeter review';
      toast.error(message);
    },
  });
}

/**
 * Remove o review LOCAL do usuário autenticado para um PR
 */
export function useDeleteMyLocalReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ repoId, prNumber }: { repoId: string; prNumber: number }) => {
      return await apiFetch(`/functions/v1/github-pulls/repos/${repoId}/pulls/${prNumber}/reviews`, {
        method: 'DELETE',
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pr', variables.repoId, variables.prNumber] });
      queryClient.invalidateQueries({ queryKey: ['prs', variables.repoId] });
      toast.success('Review removido.');
    },
    onError: (error: any) => {
      const message = error?.payload?.error || error?.message || 'Erro ao remover review';
      toast.error(message);
    },
  });
}

/**
 * Hook para fazer merge de PR
 */
export function useMergePR() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ repoId, prNumber, ...input }: { repoId: string; prNumber: number } & MergePRInput) => {
      return await apiFetch(`/functions/v1/github-pulls/repos/${repoId}/pulls/${prNumber}/merge`, {
        method: 'POST',
        body: input,
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pr', variables.repoId, variables.prNumber] });
      queryClient.invalidateQueries({ queryKey: ['prs', variables.repoId] });
      queryClient.invalidateQueries({ queryKey: ['tarefas'] });
      toast.success('PR mergeado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao fazer merge');
    },
  });
}

/**
 * Hook para criar comentário geral no PR
 */
export function useCreatePRComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ repoId, prNumber, body }: { repoId: string; prNumber: number; body: string }) => {
      return await apiFetch(`/functions/v1/github-pulls/repos/${repoId}/pulls/${prNumber}/comments`, {
        method: 'POST',
        body: { body },
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pr', variables.repoId, variables.prNumber] });
      toast.success('Comentário adicionado!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao adicionar comentário');
    },
  });
}

/**
 * Hook para criar novo Pull Request
 */
export function useCreatePR() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      repoId,
      title,
      description,
      head,
      base,
      draft = false
    }: {
      repoId: string;
      title: string;
      description?: string;
      head: string;
      base: string;
      draft?: boolean;
    }) => {
      return await apiFetch(`/functions/v1/github-pulls/repos/${repoId}/pulls`, {
        method: 'POST',
        body: { title, description, head, base, draft },
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['prs', variables.repoId] });
      queryClient.invalidateQueries({ queryKey: ['pr', variables.repoId] });
      toast.success('Pull Request criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao criar Pull Request');
    },
  });
}

/**
 * Hook para criar comentário inline no PR
 */
export function useCreateInlineComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      repoId,
      prNumber,
      body,
      path,
      line,
      side,
      in_reply_to_id
    }: {
      repoId: string;
      prNumber: number;
      body: string;
      path: string;
      line: number;
      side: 'LEFT' | 'RIGHT';
      in_reply_to_id?: string;
    }) => {
      return await apiFetch(`/functions/v1/github-pulls/repos/${repoId}/pulls/${prNumber}/inline-comments`, {
        method: 'POST',
        body: { body, path, line, side, in_reply_to_id },
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pr', variables.repoId, variables.prNumber] });
      toast.success('Comentário inline adicionado!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao adicionar comentário inline');
    },
  });
}

/**
 * Hook para inbox de reviews
 */
export function useReviewInbox(projectId: string | undefined) {
  return useQuery({
    queryKey: ['review-inbox', projectId],
    queryFn: async () => {
      if (!projectId) return { prs: [], pendingCount: 0 };

      return await apiFetch<{ prs: PullRequest[]; pendingCount: number }>(
        `/functions/v1/github-pulls/reviews/inbox?projectId=${projectId}`
      );
    },
    enabled: !!projectId,
  });
}

/**
 * Hook para resolver thread de comentários
 */
export function useResolveThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      repoId,
      prNumber,
      threadId,
      resolution,
      reason
    }: {
      repoId: string;
      prNumber: number;
      threadId: string;
      resolution: 'RESOLVED' | 'WONT_FIX';
      reason?: string;
    }) => {
      return await apiFetch(`/functions/v1/github-pulls/repos/${repoId}/pulls/${prNumber}/threads/${threadId}/resolve`, {
        method: 'POST',
        body: { resolution, reason },
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pr', variables.repoId, variables.prNumber] });
      toast.success('Thread resolvida!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao resolver thread');
    },
  });
}

/**
 * Hook para adicionar reação a um comentário
 */
export function useAddReaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      repoId,
      prNumber,
      commentId,
      reaction,
      reason
    }: {
      repoId: string;
      prNumber: number;
      commentId: string;
      reaction: 'like' | 'dislike' | 'contra';
      reason?: string;
    }) => {
      return await apiFetch(`/functions/v1/github-pulls/repos/${repoId}/pulls/${prNumber}/comments/${commentId}/reactions`, {
        method: 'POST',
        body: { reaction, reason },
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pr', variables.repoId, variables.prNumber] });
      toast.success('Reação adicionada!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao adicionar reação');
    },
  });
}

