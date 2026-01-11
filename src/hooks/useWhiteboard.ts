import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Whiteboard, WhiteboardObject, CanvasViewport } from "@/components/whiteboard/types";

interface UseWhiteboardOptions {
  projectId: string;
  whiteboardId?: string;
}

function parseViewport(data: any): CanvasViewport {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    return {
      x: typeof obj.x === 'number' ? obj.x : 0,
      y: typeof obj.y === 'number' ? obj.y : 0,
      zoom: typeof obj.zoom === 'number' ? obj.zoom : 1,
    };
  }
  return { x: 0, y: 0, zoom: 1 };
}

function parseJsonObject(data: any): Record<string, unknown> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

function parseSnapshot(data: any): Record<string, unknown> | null {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

export function useWhiteboard({ projectId, whiteboardId }: UseWhiteboardOptions) {
  const [whiteboard, setWhiteboard] = useState<Whiteboard | null>(null);
  const [whiteboards, setWhiteboards] = useState<Whiteboard[]>([]);
  const [objects, setObjects] = useState<WhiteboardObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch all whiteboards for project
  const fetchWhiteboards = useCallback(async () => {
    try {
      const data = await apiFetch<any[]>(`/whiteboards?projectId=${projectId}`);
      
      const typedData = (data || []).map(wb => ({
        ...wb,
        viewport: parseViewport(wb.viewport),
        branch_metadata: parseJsonObject(wb.branch_metadata),
        settings: parseJsonObject(wb.settings),
        canvas_snapshot: parseSnapshot(wb.canvas_snapshot ?? null),
        snapshot_version: typeof wb.snapshot_version === 'number' ? wb.snapshot_version : 0,
      }));
      
      setWhiteboards(typedData);
    } catch (error) {
      console.error('Error fetching whiteboards:', error);
      toast.error('Erro ao carregar quadros');
    }
  }, [projectId]);

  // Fetch single whiteboard with objects
  const fetchWhiteboard = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const wb = await apiFetch<any>(`/whiteboards/${id}`);

      const typedWb: Whiteboard = {
        ...wb,
        viewport: parseViewport(wb.viewport),
        branch_metadata: parseJsonObject(wb.branch_metadata),
        settings: parseJsonObject(wb.settings),
        canvas_snapshot: parseSnapshot(wb.canvas_snapshot ?? null),
        snapshot_version: typeof wb.snapshot_version === 'number' ? wb.snapshot_version : 0,
      };
      setWhiteboard(typedWb);

      // Canvas is now sourced from whiteboards.canvas_snapshot (objects table is kept for legacy/comment linkage only)
      setObjects([]);
    } catch (error) {
      console.error('Error fetching whiteboard:', error);
      toast.error('Erro ao carregar quadro');
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new whiteboard
  const createWhiteboard = useCallback(async (name: string) => {
    try {
      const data = await apiFetch<any>(`/whiteboards?projectId=${projectId}`, {
        method: 'POST',
        body: { name },
      });

      const typedData: Whiteboard = {
        ...data,
        viewport: parseViewport(data.viewport),
        branch_metadata: parseJsonObject(data.branch_metadata),
        settings: parseJsonObject(data.settings),
        canvas_snapshot: parseSnapshot(data.canvas_snapshot ?? null),
        snapshot_version: typeof data.snapshot_version === 'number' ? data.snapshot_version : 0,
      };

      setWhiteboards(prev => [typedData, ...prev]);
      toast.success('Quadro criado com sucesso');
      return typedData;
    } catch (error) {
      console.error('Error creating whiteboard:', error);
      toast.error('Erro ao criar quadro');
      return null;
    }
  }, [projectId]);

  // Delete whiteboard
  const deleteWhiteboard = useCallback(async (id: string) => {
    try {
      await apiFetch(`/whiteboards/${id}`, { method: 'DELETE' });

      setWhiteboards(prev => prev.filter(wb => wb.id !== id));
      toast.success('Quadro excluído');
    } catch (error) {
      console.error('Error deleting whiteboard:', error);
      toast.error('Erro ao excluir quadro');
    }
  }, []);

  // Save viewport
  const saveViewport = useCallback(async (viewport: CanvasViewport) => {
    if (!whiteboardId) return;

    try {
      await apiFetch(`/whiteboards/${whiteboardId}`, {
        method: 'PUT',
        body: { viewport },
      });
    } catch (error) {
      console.error('Error saving viewport:', error);
    }
  }, [whiteboardId]);

  // Save snapshot (debounced in component) - single per-whiteboard JSON snapshot
  const saveSnapshot = useCallback(async (snapshot: Record<string, unknown>) => {
    if (!whiteboardId) return;
    
    const startTime = Date.now();
    setSaving(true);
    try {
      console.log('[Whiteboard] Saving canvas snapshot', {
        whiteboardId,
        approxBytes: (() => {
          try { return new Blob([JSON.stringify(snapshot)]).size; } catch { return -1; }
        })(),
      });

      const data = await apiFetch<any>(`/whiteboards/${whiteboardId}`, {
        method: 'PUT',
        body: { canvas_snapshot: snapshot },
      });

      setWhiteboard(prev => prev ? {
        ...prev,
        canvas_snapshot: parseSnapshot(data.canvas_snapshot ?? null),
        snapshot_version: typeof data.snapshot_version === 'number' ? data.snapshot_version : prev.snapshot_version,
      } : prev);

      const duration = Date.now() - startTime;
      console.log('[Whiteboard] Save completed (canvas_snapshot)', {
        whiteboardId,
        durationMs: duration,
      });
    } catch (error: any) {
      console.error('Error saving canvas snapshot:', {
        error,
        message: error?.message,
      });
      const msg = String(error?.message || '');
      if (msg.toLowerCase().includes('forbidden') || msg.toLowerCase().includes('unauthorized')) {
        toast.error('Sem permissão para editar este quadro. Verifique seu papel no projeto (precisa ser admin/tech_lead/developer).');
      } else {
        toast.error('Erro ao salvar quadro');
      }
    } finally {
      setSaving(false);
    }
  }, [whiteboardId]);

  // Rename whiteboard
  const renameWhiteboard = useCallback(async (id: string, name: string) => {
    try {
      await apiFetch(`/whiteboards/${id}`, {
        method: 'PUT',
        body: { name },
      });

      setWhiteboards(prev => prev.map(wb => 
        wb.id === id ? { ...wb, name } : wb
      ));
      
      if (whiteboard?.id === id) {
        setWhiteboard(prev => prev ? { ...prev, name } : null);
      }
      
      toast.success('Quadro renomeado');
    } catch (error) {
      console.error('Error renaming whiteboard:', error);
      toast.error('Erro ao renomear quadro');
    }
  }, [whiteboard]);

  // Initial fetch
  useEffect(() => {
    fetchWhiteboards();
  }, [fetchWhiteboards]);

  useEffect(() => {
    if (whiteboardId) {
      fetchWhiteboard(whiteboardId);
    } else {
      setLoading(false);
    }
  }, [whiteboardId, fetchWhiteboard]);

  return {
    whiteboard,
    whiteboards,
    objects,
    loading,
    saving,
    createWhiteboard,
    deleteWhiteboard,
    renameWhiteboard,
    saveViewport,
    saveSnapshot,
    fetchWhiteboards,
  };
}
