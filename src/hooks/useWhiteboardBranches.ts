import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

interface UseWhiteboardBranchesOptions {
  projectId: string;
  onBranchCreated?: (newWhiteboardId: string) => void;
}

export function useWhiteboardBranches({ projectId, onBranchCreated }: UseWhiteboardBranchesOptions) {
  const [loading, setLoading] = useState(false);
  void projectId;

  const createBranch = useCallback(async (sourceWhiteboardId: string, branchName: string) => {
    setLoading(true);
    try {
      const data = await apiFetch<{ id: string }>(`/whiteboards/${sourceWhiteboardId}/branches`, {
        method: 'POST',
        body: { name: branchName },
      });

      toast.success(`Branch "${branchName}" criado com sucesso`);
      onBranchCreated?.(data.id);
      return data.id;
    } catch (error) {
      console.error('Error creating branch:', error);
      toast.error('Erro ao criar branch');
      return null;
    } finally {
      setLoading(false);
    }
  }, [onBranchCreated]);

  const mergeBranch = useCallback(async (branchWhiteboardId: string, targetWhiteboardId: string) => {
    setLoading(true);
    try {
      await apiFetch(`/whiteboards/${targetWhiteboardId}/branches/${branchWhiteboardId}/merge`, {
        method: 'POST',
      });

      toast.success('Branch mesclado com sucesso');
      return true;
    } catch (error) {
      console.error('Error merging branch:', error);
      toast.error('Erro ao mesclar branch');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const getBranches = useCallback(async (parentWhiteboardId: string) => {
    try {
      const data = await apiFetch<any[]>(`/whiteboards/${parentWhiteboardId}/branches`);
      return data || [];
    } catch (error) {
      console.error('Error fetching branches:', error);
      return [];
    }
  }, []);

  return {
    loading,
    createBranch,
    mergeBranch,
    getBranches,
  };
}
