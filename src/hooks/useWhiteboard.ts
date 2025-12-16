import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Whiteboard, WhiteboardObject, CanvasViewport } from "@/components/whiteboard/types";
import { FabricObject } from "fabric";
import { Json } from "@/integrations/supabase/types";

interface UseWhiteboardOptions {
  projectId: string;
  whiteboardId?: string;
}

function parseViewport(data: Json | null): CanvasViewport {
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

function parseJsonObject(data: Json | null): Record<string, unknown> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
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
      const { data, error } = await supabase
        .from('whiteboards')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const typedData = (data || []).map(wb => ({
        ...wb,
        viewport: parseViewport(wb.viewport),
        branch_metadata: parseJsonObject(wb.branch_metadata),
        settings: parseJsonObject(wb.settings),
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
      const { data: wb, error: wbError } = await supabase
        .from('whiteboards')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (wbError) throw wbError;
      if (!wb) {
        toast.error('Quadro não encontrado');
        return;
      }

      const typedWb: Whiteboard = {
        ...wb,
        viewport: parseViewport(wb.viewport),
        branch_metadata: parseJsonObject(wb.branch_metadata),
        settings: parseJsonObject(wb.settings),
      };
      setWhiteboard(typedWb);

      const { data: objs, error: objsError } = await supabase
        .from('whiteboard_objects')
        .select('*')
        .eq('whiteboard_id', id)
        .order('z_index', { ascending: true });

      if (objsError) throw objsError;
      
      const typedObjs = (objs || []).map(obj => ({
        ...obj,
        properties: parseJsonObject(obj.properties),
      }));
      
      setObjects(typedObjs);
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('whiteboards')
        .insert({
          project_id: projectId,
          name,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      const typedData: Whiteboard = {
        ...data,
        viewport: parseViewport(data.viewport),
        branch_metadata: parseJsonObject(data.branch_metadata),
        settings: parseJsonObject(data.settings),
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
      const { error } = await supabase
        .from('whiteboards')
        .delete()
        .eq('id', id);

      if (error) throw error;

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
      const { error } = await supabase
        .from('whiteboards')
        .update({ viewport: viewport as unknown as Json })
        .eq('id', whiteboardId);

      if (error) throw error;
    } catch (error) {
      console.error('Error saving viewport:', error);
    }
  }, [whiteboardId]);

  // Save objects (debounced in component)
  const saveObjects = useCallback(async (fabricObjects: FabricObject[]) => {
    if (!whiteboardId) return;
    
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Delete existing objects
      await supabase
        .from('whiteboard_objects')
        .delete()
        .eq('whiteboard_id', whiteboardId);

      if (fabricObjects.length === 0) {
        setSaving(false);
        return;
      }

      // Insert new objects
      const objectsToInsert = fabricObjects.map((obj, index) => ({
        whiteboard_id: whiteboardId,
        type: obj.type || 'unknown',
        properties: obj.toObject() as unknown as Json,
        z_index: index,
        created_by: user.id,
      }));

      const { error } = await supabase
        .from('whiteboard_objects')
        .insert(objectsToInsert);

      if (error) throw error;
    } catch (error) {
      console.error('Error saving objects:', error);
      toast.error('Erro ao salvar objetos');
    } finally {
      setSaving(false);
    }
  }, [whiteboardId]);

  // Rename whiteboard
  const renameWhiteboard = useCallback(async (id: string, name: string) => {
    try {
      const { error } = await supabase
        .from('whiteboards')
        .update({ name })
        .eq('id', id);

      if (error) throw error;

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
    saveObjects,
    fetchWhiteboards,
  };
}
