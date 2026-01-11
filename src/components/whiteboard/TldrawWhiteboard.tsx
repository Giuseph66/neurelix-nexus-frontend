import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  Tldraw,
  Editor,
  TLStoreSnapshot,
  DefaultContextMenu,
  DefaultContextMenuContent,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  type TLUiContextMenuProps,
  type TLComponents,
  useEditor,
  useValue,
} from 'tldraw';
import { getSnapshot, loadSnapshot } from '@tldraw/editor';
import 'tldraw/tldraw.css';
import { apiFetch, ApiError } from '@/lib/api';
import { getAccessToken } from '@/lib/authTokens';
import { WhiteboardSocket } from '@/lib/realtime/whiteboardSocket';
import { toast } from 'sonner';
import { useSidebar } from '@/components/ui/sidebar';

const EPHEMERAL_PREFIXES = [
  'instance:',
  'camera:',
  'pointer:',
  'instance_presence:',
  'instance_page_state:',
] as const;

const MAX_ANALYZE_SELECTION_CHARS = 999999999999;

const isEphemeralId = (id: string) =>
  EPHEMERAL_PREFIXES.some((prefix) => id.startsWith(prefix));

function getWsBaseUrl() {
  const base = import.meta.env.VITE_API_URL as string | undefined;
  if (!base) return null;
  return base.replace(/^http/i, 'ws').replace(/\/$/, '');
}

interface TldrawWhiteboardProps {
  whiteboardId: string;
  onEditorReady?: (editor: Editor) => void;
  commentMode?: boolean;
  onCanvasClick?: (point: { x: number; y: number }) => void;
  drawerState?: boolean;
  isEditable?: boolean;
  onCanvasInteraction?: () => void;
  onAnalyzeSelection?: (payload: { selectionJson: string; shapeCount: number }) => void;
}

export const TldrawWhiteboard = ({
  whiteboardId,
  onEditorReady,
  commentMode = false,
  onCanvasClick,
  drawerState,
  isEditable = true,
  onCanvasInteraction,
  onAnalyzeSelection,
}: TldrawWhiteboardProps) => {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isLoadingDataRef = useRef(false);
  const realtimeRef = useRef<WhiteboardSocket | null>(null);
  const resyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSnapshotVersionRef = useRef<number>(-1);
  const lastSnapshotKeyRef = useRef<string>('');
  const dirtyRef = useRef(false);
  const flushingRef = useRef(false);
  const flushRequestedRef = useRef(false);
  const clientIdRef = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  );

  const handleAnalyzeSelection = useCallback(
    async (editorInstance: Editor) => {
      if (!onAnalyzeSelection) return;
      const selectedIds = editorInstance.getSelectedShapeIds();
      if (selectedIds.length === 0) {
        toast.error('Selecione um ou mais elementos para enviar para a IA.');
        return;
      }

      const content = await editorInstance.resolveAssetsInContent(
        editorInstance.getContentFromCurrentPage(selectedIds)
      );
      const selectionJson = JSON.stringify(content);

      if (selectionJson.length > MAX_ANALYZE_SELECTION_CHARS) {
        toast.error('Foram selecionados muitos elementos. Selecione uma quantidade menor.');
        return;
      }

      onAnalyzeSelection({ selectionJson, shapeCount: selectedIds.length });
    },
    [onAnalyzeSelection]
  );

  const ContextMenu = useCallback(
    function ContextMenu(props: TLUiContextMenuProps) {
      const menuEditor = useEditor();
      const hasSelection = useValue(
        'hasSelection',
        () => menuEditor.getSelectedShapeIds().length > 0,
        [menuEditor]
      );

      return (
        <DefaultContextMenu {...props}>
          <DefaultContextMenuContent />
          {onAnalyzeSelection && (
            <TldrawUiMenuGroup id="ai-analysis">
              <TldrawUiMenuItem
                id="ai-analyze-selection"
                label="Enviar para IA analisar"
                disabled={!hasSelection}
                onSelect={() => {
                  void handleAnalyzeSelection(menuEditor);
                }}
              />
            </TldrawUiMenuGroup>
          )}
        </DefaultContextMenu>
      );
    },
    [handleAnalyzeSelection, onAnalyzeSelection]
  );

  const components = useMemo<TLComponents>(
    () => ({
      ContextMenu,
    }),
    [ContextMenu]
  );

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

  const applyRemoteSnapshot = useCallback((snapshot: TLStoreSnapshot, version?: number) => {
    if (!editor) return;

    const nextVersion = typeof version === 'number' ? version : -1;
    if (nextVersion !== -1 && nextVersion <= lastSnapshotVersionRef.current) {
      console.log('[TldrawWhiteboard] Snapshot ignored (old version)', {
        whiteboardId,
        nextVersion,
        lastVersion: lastSnapshotVersionRef.current,
      });
      return;
    }

    const filtered = filterSnapshot(snapshot);
    const snapshotKey = JSON.stringify(filtered ?? {});
    if (snapshotKey === lastSnapshotKeyRef.current && nextVersion <= lastSnapshotVersionRef.current) {
      console.log('[TldrawWhiteboard] Snapshot ignored (same data)', {
        whiteboardId,
        version: nextVersion,
        bytes: snapshotKey.length,
      });
      return;
    }

    isLoadingDataRef.current = true;
    const camera = editor.getCamera();
    loadSnapshot(editor.store, filtered);
    if (camera) {
      editor.setCamera(camera);
    }
    isLoadingDataRef.current = false;

    lastSnapshotVersionRef.current =
      nextVersion !== -1 ? Math.max(lastSnapshotVersionRef.current, nextVersion) : lastSnapshotVersionRef.current;
    lastSnapshotKeyRef.current = snapshotKey;
    console.log('[TldrawWhiteboard] Applied remote snapshot', {
      whiteboardId,
      version: nextVersion,
      bytes: snapshotKey.length,
    });
  }, [editor, filterSnapshot, whiteboardId]);

  const refreshSnapshotFromServer = useCallback(async (reason: string) => {
    if (!editor) return;
    try {
      const data = await apiFetch<any>(`/whiteboards/${whiteboardId}`);
      const serverVersion =
        typeof data?.snapshot_version === 'number'
          ? data.snapshot_version
          : typeof data?.snapshot_version === 'string'
            ? Number(data.snapshot_version)
            : -1;

      if (serverVersion > lastSnapshotVersionRef.current && data?.canvas_snapshot) {
        console.log('[TldrawWhiteboard] Syncing snapshot from server', {
          whiteboardId,
          reason,
          serverVersion,
          localVersion: lastSnapshotVersionRef.current,
        });
        applyRemoteSnapshot(data.canvas_snapshot as TLStoreSnapshot, serverVersion);
      } else {
        console.log('[TldrawWhiteboard] Server snapshot already up to date', {
          whiteboardId,
          reason,
          serverVersion,
          localVersion: lastSnapshotVersionRef.current,
        });
      }
    } catch (err) {
      console.warn('[TldrawWhiteboard] Failed to refresh snapshot from server', {
        whiteboardId,
        reason,
        err,
      });
    }
  }, [applyRemoteSnapshot, editor, whiteboardId]);

  // Load saved data from database
  const loadWhiteboardData = useCallback(
    async (editorInstance: Editor) => {
      try {
        isLoadingDataRef.current = true;
        const data = await apiFetch<any>(`/whiteboards/${whiteboardId}`);

        if (typeof data?.snapshot_version === 'number') {
          lastSnapshotVersionRef.current = data.snapshot_version;
        }

        if (data?.canvas_snapshot && typeof data.canvas_snapshot === 'object') {
          const snapshot = filterSnapshot(data.canvas_snapshot as unknown as TLStoreSnapshot);
          lastSnapshotKeyRef.current = JSON.stringify(snapshot ?? {});
          if ((snapshot as any).store && Object.keys((snapshot as any).store).length > 0) {
            loadSnapshot(editorInstance.store, snapshot);
            console.log('[TldrawWhiteboard] Loaded snapshot from database', {
              whiteboardId,
              version: typeof data.snapshot_version === 'number' ? data.snapshot_version : null,
              bytes: JSON.stringify(snapshot).length,
            });
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

  // Realtime sync (WebSocket + periodic resync)
  useEffect(() => {
    if (!editor || !whiteboardId) return;

    const realtime = new WhiteboardSocket(
      {
        whiteboardId,
        clientId: clientIdRef.current,
        getToken: getAccessToken,
        getWsBaseUrl,
        heartbeatMs: 20000,
        pongTimeoutMs: 60000,
        maxBufferedBytes: 2 * 1024 * 1024,
      },
      {
        onStatus: (status, detail) => {
          if (status === 'open') {
            console.log('[TldrawWhiteboard] WS connected', { whiteboardId });
            void refreshSnapshotFromServer('ws-open');
            return;
          }
          if (status === 'connecting') {
            console.log('[TldrawWhiteboard] WS connecting', { whiteboardId });
            return;
          }
          if (status === 'closed') {
            console.warn('[TldrawWhiteboard] WS closed', {
              whiteboardId,
              code: detail?.code,
              reason: detail?.reason,
            });
          }
        },
        onSnapshot: (payload) => {
          if (payload.clientId && payload.clientId === clientIdRef.current) return;
          console.log('[TldrawWhiteboard] WS snapshot received', {
            whiteboardId,
            version: payload.version,
            fromClientId: payload.clientId ?? null,
          });
          applyRemoteSnapshot(payload.snapshot as TLStoreSnapshot, payload.version);
        },
        onAck: (version) => {
          if (version > lastSnapshotVersionRef.current) {
            lastSnapshotVersionRef.current = version;
          } else {
            console.log('[TldrawWhiteboard] WS ack ignored (old)', {
              whiteboardId,
              version,
              lastVersion: lastSnapshotVersionRef.current,
            });
          }
          console.log('[TldrawWhiteboard] WS ack', { whiteboardId, version });
        },
        onError: (err) => {
          console.warn('[TldrawWhiteboard] WS error', { whiteboardId, err });
        },
      }
    );

    realtimeRef.current = realtime;
    realtime.connect();

    resyncIntervalRef.current = setInterval(() => {
      void refreshSnapshotFromServer('interval');
    }, 30000);

    return () => {
      if (resyncIntervalRef.current) {
        clearInterval(resyncIntervalRef.current);
        resyncIntervalRef.current = null;
      }
      realtime.disconnect();
      if (realtimeRef.current === realtime) {
        realtimeRef.current = null;
      }
    };
  }, [editor, whiteboardId, applyRemoteSnapshot, refreshSnapshotFromServer]);

  const flushSnapshot = useCallback(
    async (reason: string) => {
      if (!editor) return;
      if (!whiteboardId) {
        console.warn('[TldrawWhiteboard] Cannot save: whiteboardId is missing');
        return;
      }
      if (isLoadingDataRef.current) return;
      if (!dirtyRef.current) return;
      if (flushingRef.current) {
        flushRequestedRef.current = true;
        return;
      }

      flushingRef.current = true;
      flushRequestedRef.current = false;

      try {
        const snapshot = filterSnapshot(getSnapshot(editor.store).document as TLStoreSnapshot);
        const snapshotJson = JSON.parse(JSON.stringify(snapshot));
        const snapshotKey = JSON.stringify(snapshotJson ?? {});

        if (snapshotKey === lastSnapshotKeyRef.current) {
          dirtyRef.current = false;
          return;
        }

        const snapshotSize = snapshotKey.length;
        if (snapshotSize > 4 * 1024 * 1024) {
          console.warn('[TldrawWhiteboard] Snapshot muito grande, pulando salvamento:', snapshotSize);
          return;
        }

        lastSnapshotKeyRef.current = snapshotKey;
        dirtyRef.current = false;

        const realtime = realtimeRef.current;
        const sendResult = realtime?.sendSnapshot(snapshotJson);
        if (sendResult?.sent) {
          console.log('[TldrawWhiteboard] Sent snapshot via websocket', {
            whiteboardId,
            bytes: snapshotSize,
            bufferedAmount: sendResult.bufferedAmount ?? null,
            reason,
          });
          return;
        }

        console.log('[TldrawWhiteboard] WS not ready, saving via HTTP', {
          whiteboardId,
          bytes: snapshotSize,
          reason: sendResult?.reason ?? 'no-ws',
        });

        const updated = await apiFetch<any>(`/whiteboards/${whiteboardId}`, {
          method: 'PUT',
          body: { canvas_snapshot: snapshotJson, clientId: clientIdRef.current },
        });

        const updatedVersion =
          typeof updated?.snapshot_version === 'number'
            ? updated.snapshot_version
            : typeof updated?.snapshot_version === 'string'
              ? Number(updated.snapshot_version)
              : null;
        if (updatedVersion !== null && !Number.isNaN(updatedVersion)) {
          if (updatedVersion > lastSnapshotVersionRef.current) {
            lastSnapshotVersionRef.current = updatedVersion;
          }
        }

        console.log('[TldrawWhiteboard] Saved snapshot to database (http)', {
          whiteboardId,
          bytes: snapshotSize,
          reason,
        });
      } catch (e: any) {
        dirtyRef.current = true;
        console.error('[TldrawWhiteboard] Error saving whiteboard:', {
          error: e,
          message: e?.message,
          name: e?.name,
          stack: e?.stack,
          whiteboardId,
        });

        if (e?.name === 'NetworkError' || e?.message?.includes('fetch') || e?.message?.includes('Failed to fetch')) {
          console.warn('[TldrawWhiteboard] Network error, will retry on next interaction');
        } else if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          toast.error('Sem permissão para editar este quadro. Você precisa ser developer, tech_lead ou admin.');
        } else {
          toast.error('Erro ao salvar quadro: ' + (e?.message || 'Erro desconhecido'));
        }
      } finally {
        flushingRef.current = false;
        if (flushRequestedRef.current) {
          void flushSnapshot('queued');
        }
      }
    },
    [editor, filterSnapshot, whiteboardId]
  );

  // Mark dirty on any document change
  useEffect(() => {
    if (!editor) return;
    const unsubscribe = editor.store.listen(() => {
      if (isLoadingDataRef.current) return;
      dirtyRef.current = true;
    }, { scope: 'document' });

    return () => {
      unsubscribe();
    };
  }, [editor]);

  // Flush snapshot on interaction end (pointer up / key up / complete)
  useEffect(() => {
    if (!editor) return;

    const handleEvent = (info: any) => {
      if (!dirtyRef.current) return;

      if (info?.type === 'pointer' && info?.name === 'pointer_up') {
        void flushSnapshot('pointer_up');
        return;
      }

      if (info?.type === 'keyboard' && info?.name === 'key_up') {
        const key = String(info.key || '');
        if (['Backspace', 'Delete', 'Enter', 'Escape', 'Tab'].includes(key) || info.ctrlKey) {
          void flushSnapshot(`key_up:${key || info.code || 'ctrl'}`);
        }
        return;
      }

      if (info?.type === 'misc' && (info?.name === 'complete' || info?.name === 'interrupt')) {
        void flushSnapshot(info.name);
      }
    };

    editor.on('event', handleEvent);
    return () => {
      editor.off('event', handleEvent);
    };
  }, [editor, flushSnapshot]);

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
          components={components}
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
