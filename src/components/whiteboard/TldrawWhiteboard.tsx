import { useCallback, useEffect, useState, useRef } from 'react';
import { Tldraw, TLRecord, Editor, TLStoreSnapshot } from 'tldraw';
import 'tldraw/tldraw.css';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSidebar } from '@/components/ui/sidebar';

const EPHEMERAL_PREFIXES = [
  'instance:',
  'camera:',
  'pointer:',
  'instance_presence:',
  'instance_page_state:',
] as const;

const isEphemeralId = (id: string) =>
  EPHEMERAL_PREFIXES.some((prefix) => id.startsWith(prefix));

interface TldrawWhiteboardProps {
  whiteboardId: string;
  onEditorReady?: (editor: Editor) => void;
  commentMode?: boolean;
  onCanvasClick?: (point: { x: number; y: number }) => void;
  drawerState?: boolean;
  isEditable?: boolean;
  onCanvasInteraction?: () => void;
}

export const TldrawWhiteboard = ({ whiteboardId, onEditorReady, commentMode = false, onCanvasClick, drawerState, isEditable = true, onCanvasInteraction }: TldrawWhiteboardProps) => {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadingDataRef = useRef(false);
  const broadcastChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const broadcastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const broadcastRAFRef = useRef<number | null>(null);
  const pendingBroadcastRef = useRef<{ records: TLRecord[]; removedIds: string[] }>({ records: [], removedIds: [] });
  const isDrawingRef = useRef(false);
  const drawingEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const filterSnapshot = useCallback((snapshot: TLStoreSnapshot): TLStoreSnapshot => {
    const s = snapshot as unknown as { store?: Record<string, unknown> };
    if (!s?.store || typeof s.store !== 'object') return snapshot;

    const filteredStoreEntries = Object.entries(s.store).filter(
      ([id]) => !isEphemeralId(id)
    );

    return {
      ...(snapshot as unknown as object),
      store: Object.fromEntries(filteredStoreEntries),
    } as TLStoreSnapshot;
  }, []);

  const filterRecordsForSync = useCallback(
    (records: TLRecord[]) => records.filter((r) => r?.id && !isEphemeralId(String(r.id))),
    []
  );

  // Load saved data from database
  const loadWhiteboardData = useCallback(
    async (editorInstance: Editor) => {
      try {
        isLoadingDataRef.current = true;
        const { data, error } = await supabase
          .from('whiteboards')
          .select('canvas_snapshot')
          .eq('id', whiteboardId)
          .maybeSingle();

        if (error) {
          console.error('[TldrawWhiteboard] Error loading whiteboard data:', error);
          return;
        }

        if (data?.canvas_snapshot && typeof data.canvas_snapshot === 'object') {
          const snapshot = filterSnapshot(data.canvas_snapshot as unknown as TLStoreSnapshot);
          if ((snapshot as any).store && Object.keys((snapshot as any).store).length > 0) {
            editorInstance.store.loadSnapshot(snapshot);
            console.log('[TldrawWhiteboard] Loaded snapshot from database');
          }
        }
      } catch (e) {
        console.error('[TldrawWhiteboard] Error loading whiteboard:', e);
      } finally {
        isLoadingDataRef.current = false;
        setIsLoading(false);
      }
    },
    [filterSnapshot, whiteboardId]
  );

  // Save data to database (debounced)
  const saveWhiteboardData = useCallback(
    async (editorInstance: Editor) => {
      if (isLoadingDataRef.current) return;
      if (!whiteboardId) {
        console.warn('[TldrawWhiteboard] Cannot save: whiteboardId is missing');
        return;
      }

      // Verificar se o usuário está autenticado
      try {
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        if (authError || !session) {
          console.warn('[TldrawWhiteboard] Cannot save: user not authenticated', authError);
          return;
        }
      } catch (authErr) {
        console.warn('[TldrawWhiteboard] Error checking auth session:', authErr);
        return;
      }

      try {
        const snapshot = filterSnapshot(editorInstance.store.getSnapshot());
        const snapshotJson = JSON.parse(JSON.stringify(snapshot));

        // Validar tamanho do snapshot (limite de ~5MB para jsonb no PostgreSQL)
        const snapshotSize = JSON.stringify(snapshotJson).length;
        if (snapshotSize > 4 * 1024 * 1024) {
          console.warn('[TldrawWhiteboard] Snapshot muito grande, pulando salvamento:', snapshotSize);
          return;
        }

        const { error } = await supabase
          .from('whiteboards')
          .update({ canvas_snapshot: snapshotJson })
          .eq('id', whiteboardId)
          .select('id')
          .maybeSingle();

        if (error) {
          console.error('[TldrawWhiteboard] Error updating whiteboard data:', {
            error,
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code,
            whiteboardId,
          });
          
          // Não mostrar toast para erros de rede temporários
          if (error.code === '42501' || error.message?.includes('permission')) {
            toast.error('Sem permissão para editar este quadro. Você precisa ser developer, tech_lead ou admin.');
          } else if (error.message?.includes('NetworkError') || error.message?.includes('fetch') || error.message?.includes('Failed to fetch')) {
            // Erro de rede - apenas logar, não mostrar toast para não incomodar o usuário
            // O salvamento será tentado novamente na próxima mudança
            console.warn('[TldrawWhiteboard] Network error during save, will retry on next change');
          } else {
            // Outros erros - mostrar toast apenas uma vez
            toast.error('Erro ao salvar quadro: ' + (error.message || 'Erro desconhecido'));
          }
        } else {
          console.log('[TldrawWhiteboard] Saved snapshot to database');
        }
      } catch (e: any) {
        console.error('[TldrawWhiteboard] Error saving whiteboard:', {
          error: e,
          message: e?.message,
          name: e?.name,
          stack: e?.stack,
          whiteboardId,
        });
        
        // Não mostrar toast para erros de rede (será tentado novamente)
        if (e?.name === 'NetworkError' || e?.message?.includes('fetch') || e?.message?.includes('Failed to fetch')) {
          console.warn('[TldrawWhiteboard] Network error, will retry on next change');
        } else {
          toast.error('Erro ao salvar quadro: ' + (e?.message || 'Erro desconhecido'));
        }
      }
    },
    [filterSnapshot, whiteboardId]
  );

  // Debounced save function
  const debouncedSave = useCallback(
    (editorInstance: Editor) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveWhiteboardData(editorInstance);
      }, 1000);
    },
    [saveWhiteboardData]
  );

  // Handle real-time sync (broadcast only)
  useEffect(() => {
    if (!editor || !whiteboardId) return;

    // Broadcast channel for immediate updates
    // self:false prevents echoing our own messages back into the same tab.
    const broadcastChannel = supabase
      .channel(`broadcast-whiteboard-${whiteboardId}`, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'sync' }, (payload) => {
        if (isLoadingDataRef.current) return;
        if (payload.payload && payload.payload.records) {
          try {
            const records = filterRecordsForSync(payload.payload.records as TLRecord[]);
            if (records.length === 0) return;

            editor.store.mergeRemoteChanges(() => {
              editor.store.put(records);
            });
            console.log('[TldrawWhiteboard] Synced records from broadcast');
          } catch (e) {
            console.error('[TldrawWhiteboard] Error syncing records:', e);
          }
        }
      })
      .on('broadcast', { event: 'delete' }, (payload) => {
        if (isLoadingDataRef.current) return;
        if (payload.payload && payload.payload.ids) {
          try {
            const ids = (payload.payload.ids as TLRecord['id'][]).map(String);
            const filteredIds = ids.filter((id) => !isEphemeralId(id));
            if (filteredIds.length === 0) return;

            editor.store.mergeRemoteChanges(() => {
              editor.store.remove(filteredIds as any);
            });
            console.log('[TldrawWhiteboard] Removed records from broadcast');
          } catch (e) {
            console.error('[TldrawWhiteboard] Error deleting records:', e);
          }
        }
      })
      .subscribe((status) => {
        console.log('[TldrawWhiteboard] Broadcast subscription status:', status);
      });

    broadcastChannelRef.current = broadcastChannel;

    // Listen to local changes
    const unsubscribe = editor.store.listen(
      (entry) => {
        const { changes, source } = entry;
        if (source !== 'user') return;
        if (isLoadingDataRef.current) return;

        const addedRecords = filterRecordsForSync(Object.values(changes.added));
        const updatedRecords = filterRecordsForSync(
          Object.values(changes.updated).map(([_, after]) => after)
        );
        const removedIds = Object.keys(changes.removed).filter((id) => !isEphemeralId(id));

        // Detectar se está desenhando (shapes do tipo "draw" sendo atualizados)
        const isDrawing = updatedRecords.some((r: any) => r?.typeName === 'shape' && r?.type === 'draw');
        if (isDrawing) {
          isDrawingRef.current = true;
        }

        // Função para enviar broadcast
        const sendBroadcast = () => {
          const { records, removedIds: pendingRemoved } = pendingBroadcastRef.current;
          
          if (records.length > 0) {
            // Remover duplicatas mantendo a versão mais recente
            const recordsMap = new Map<string, TLRecord>();
            records.forEach((r) => {
              const id = String(r.id);
              recordsMap.set(id, r);
            });
            const uniqueRecords = Array.from(recordsMap.values());

            broadcastChannel.send({
              type: 'broadcast',
              event: 'sync',
              payload: { records: uniqueRecords },
            });
          }

          if (pendingRemoved.length > 0) {
            broadcastChannel.send({
              type: 'broadcast',
              event: 'delete',
              payload: { ids: [...new Set(pendingRemoved)] },
            });
          }

          // Limpar pendências
          pendingBroadcastRef.current = { records: [], removedIds: [] };
        };

        // Acumular mudanças
        if (addedRecords.length > 0 || updatedRecords.length > 0) {
          pendingBroadcastRef.current.records.push(...addedRecords, ...updatedRecords);
        }
        if (removedIds.length > 0) {
          pendingBroadcastRef.current.removedIds.push(...removedIds);
        }

        // Durante desenho: APENAS acumular, NÃO fazer broadcast
        // Broadcast será feito quando o desenho terminar
        if (isDrawing) {
          // Cancelar qualquer timeout/RAF anterior
          if (broadcastTimeoutRef.current) {
            clearTimeout(broadcastTimeoutRef.current);
            broadcastTimeoutRef.current = null;
          }
          if (broadcastRAFRef.current !== null) {
            cancelAnimationFrame(broadcastRAFRef.current);
            broadcastRAFRef.current = null;
          }
          
          // Limpar timeout anterior de fim de desenho
          if (drawingEndTimeoutRef.current) {
            clearTimeout(drawingEndTimeoutRef.current);
          }
          
          // Agendar broadcast e salvamento quando o desenho terminar (200ms sem atualizações)
          drawingEndTimeoutRef.current = setTimeout(() => {
            // Fazer broadcast de todas as mudanças acumuladas
            sendBroadcast();
            
            // Salvar no banco
            isDrawingRef.current = false;
            debouncedSave(editor);
            
            drawingEndTimeoutRef.current = null;
          }, 200); // 200ms após a última atualização de desenho
        } else {
          // Para mudanças não relacionadas a desenho: broadcast e salvamento imediato
          // Cancelar RAF se existir
          if (broadcastRAFRef.current !== null) {
            cancelAnimationFrame(broadcastRAFRef.current);
            broadcastRAFRef.current = null;
          }
          
          // Enviar broadcast imediatamente
          sendBroadcast();
          
          // Salvar no banco (com debounce)
          debouncedSave(editor);
        }
      },
      { scope: 'document', source: 'user' }
    );

    return () => {
      unsubscribe();
      if (broadcastChannelRef.current) {
        supabase.removeChannel(broadcastChannelRef.current);
        broadcastChannelRef.current = null;
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (broadcastTimeoutRef.current) {
        clearTimeout(broadcastTimeoutRef.current);
      }
      if (broadcastRAFRef.current !== null) {
        cancelAnimationFrame(broadcastRAFRef.current);
      }
      if (drawingEndTimeoutRef.current) {
        clearTimeout(drawingEndTimeoutRef.current);
      }
    };
  }, [editor, whiteboardId, debouncedSave, filterRecordsForSync]);

  // Handle canvas clicks for comment mode via pointer events
  useEffect(() => {
    if (!editor || !commentMode || !onCanvasClick) return;

    const handlePointerDown = (e: PointerEvent) => {
      const container = editor.getContainer();
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const point = editor.screenToPage({ x, y });
      onCanvasClick(point);
    };

    const container = editor.getContainer();
    container.addEventListener('pointerdown', handlePointerDown);
    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [editor, commentMode, onCanvasClick]);

  // Handle Ctrl + scroll for zoom
  useEffect(() => {
    if (!editor) return;

    const container = editor.getContainer();
    
    const handleWheel = (e: WheelEvent) => {
      // Verificar se Ctrl está pressionado (ou Cmd no Mac)
      if (!e.ctrlKey && !e.metaKey) return;
      
      // Prevenir comportamento padrão (zoom do navegador)
      e.preventDefault();
      e.stopPropagation();
      
      // Obter posição do mouse no canvas
      const rect = container.getBoundingClientRect();
      const screenPoint = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      
      // Converter para coordenadas da página
      const pagePoint = editor.screenToPage(screenPoint);
      
      // Obter zoom atual
      const currentZoom = editor.getZoomLevel();
      
      // Calcular novo zoom (deltaY negativo = zoom in, positivo = zoom out)
      // Usar uma sensibilidade mais suave
      const zoomDelta = -e.deltaY * 0.002;
      const newZoom = Math.max(0.1, Math.min(8, currentZoom * (1 + zoomDelta)));
      
      // Obter câmera atual
      const camera = editor.getCamera();
      
      // Calcular fator de zoom
      const zoomFactor = newZoom / currentZoom;
      
      // Ajustar posição da câmera para manter o ponto da página fixo
      const newCamera = {
        x: pagePoint.x - (screenPoint.x - camera.x) / zoomFactor,
        y: pagePoint.y - (screenPoint.y - camera.y) / zoomFactor,
        z: newZoom,
      };
      
      editor.setCamera(newCamera);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [editor]);

  const handleMount = useCallback((editorInstance: Editor) => {
    setEditor(editorInstance);
    editorInstance.user.updateUserPreferences({ colorScheme: 'dark' });
    editorInstance.updateInstanceState({ isGridMode: true });
    
    // Desabilitar debug mode
    const editorAny = editorInstance as any;
    if (editorAny.setDebugMode) {
      editorAny.setDebugMode(false);
    }
    if (editorAny.updateInstanceState) {
      editorInstance.updateInstanceState({ isDebugMode: false } as any);
    }
    
    // Aguardar um frame para garantir que o DOM está pronto
    requestAnimationFrame(() => {
      // Forçar recálculo do viewport após mount
      const container = editorInstance.getContainer();
      if (container) {
        // Disparar evento de resize para o tldraw recalcular
        const resizeEvent = new Event('resize', { bubbles: true });
        container.dispatchEvent(resizeEvent);
        window.dispatchEvent(resizeEvent);
      }
    });
    
    loadWhiteboardData(editorInstance);
    
    if (onEditorReady) {
      onEditorReady(editorInstance);
    }
  }, [whiteboardId, loadWhiteboardData, onEditorReady]);

  // Desabilitar/habilitar edição baseado em isEditable
  useEffect(() => {
    if (!editor) return;

    const container = editor.getContainer();
    if (!container) return;

    if (!isEditable) {
      // Desabilitar interação quando drawer está aberto
      container.style.pointerEvents = 'none';
      container.style.userSelect = 'none';
      container.style.cursor = 'not-allowed';
      
      // Desabilitar todas as ferramentas
      editor.setCurrentTool('select');
    } else {
      // Habilitar interação quando drawer está fechado
      container.style.pointerEvents = 'auto';
      container.style.userSelect = 'auto';
      container.style.cursor = '';
    }
  }, [editor, isEditable]);

  // Detectar interações no canvas para minimizar drawer
  useEffect(() => {
    if (!editor || !onCanvasInteraction) return;

    const container = editor.getContainer();
    if (!container) return;

    const handlePointerDown = (e: PointerEvent) => {
      // Só chamar callback se não estiver editável (drawer aberto)
      // Isso permite que o clique minimize o drawer
      if (!isEditable && onCanvasInteraction) {
        onCanvasInteraction();
      }
    };

    container.addEventListener('pointerdown', handlePointerDown);
    
    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [editor, onCanvasInteraction, isEditable]);

  // Recalcular tamanho do container quando o sidebar ou drawer de quadros mudar
  const { state: sidebarState } = useSidebar();
  
  useEffect(() => {
    if (!editor) return;

    const handleResize = () => {
      // Pequeno delay para garantir que a transição terminou
      setTimeout(() => {
        const container = editor.getContainer();
        if (container) {
          // Disparar evento de resize para o tldraw recalcular
          const resizeEvent = new Event('resize', { bubbles: true });
          container.dispatchEvent(resizeEvent);
          window.dispatchEvent(resizeEvent);
          
          // Forçar renderização
          editor.updateInstanceState({});
        }
      }, 350);
    };

    handleResize();

    // Também observar eventos de resize da janela
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [editor, sidebarState, drawerState]);

  return (
    <div className="w-full h-full relative" style={{ position: 'relative', width: '100%', height: '100%' }}>
      {isLoading && (
        <div className="absolute inset-0 z-[999] bg-background/80 flex items-center justify-center">
          <div className="text-muted-foreground">Carregando quadro...</div>
        </div>
      )}
      {commentMode && (
        <div 
          className="absolute inset-0 z-[998] cursor-crosshair"
          style={{ pointerEvents: 'auto' }}
          onPointerDown={(e) => {
            // Prevenir que o evento chegue ao tldraw quando em modo de comentário
            e.stopPropagation();
          }}
        />
      )}
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <Tldraw
          onMount={handleMount}
          inferDarkMode={false}
          forceMobile={false}
        />
      </div>
      <style>{`
        /* Ocultar painel de debug do tldraw */
        .tl-debug-panel,
        [data-testid="debug-panel"],
        .tlui-debug-panel,
        .tl-debug,
        [class*="debug"] {
          display: none !important;
        }
        
        /* Garantir que o container do tldraw ocupe todo o espaço disponível */
        .tl-container {
          width: 100% !important;
          height: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          position: relative !important;
        }
        
        /* Garantir que o canvas interno do tldraw não tenha overflow */
        .tl-container .tl-canvas {
          width: 100% !important;
          height: 100% !important;
          overflow: visible !important;
        }
      `}</style>
    </div>
  );
};

export default TldrawWhiteboard;

