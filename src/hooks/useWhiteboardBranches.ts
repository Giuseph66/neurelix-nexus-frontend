import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UseWhiteboardBranchesOptions {
  projectId: string;
  onBranchCreated?: (newWhiteboardId: string) => void;
}

export function useWhiteboardBranches({ projectId, onBranchCreated }: UseWhiteboardBranchesOptions) {
  const [loading, setLoading] = useState(false);

  const createBranch = useCallback(async (sourceWhiteboardId: string, branchName: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('create_whiteboard_branch', {
        source_whiteboard_id: sourceWhiteboardId,
        branch_name: branchName,
      });

      if (error) throw error;

      toast.success(`Branch "${branchName}" criado com sucesso`);
      onBranchCreated?.(data);
      return data;
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
      const { data, error } = await supabase.rpc('merge_whiteboard_branch', {
        branch_whiteboard_id: branchWhiteboardId,
        target_whiteboard_id: targetWhiteboardId,
      });

      if (error) throw error;

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
      const { data, error } = await supabase
        .from('whiteboards')
        .select('*')
        .eq('parent_branch_id', parentWhiteboardId)
        .order('created_at', { ascending: false });

      if (error) throw error;
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
