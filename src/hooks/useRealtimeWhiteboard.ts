import { useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { Canvas as FabricCanvas } from "fabric";

interface UseRealtimeWhiteboardOptions {
  whiteboardId: string | null;
  getCanvas: () => FabricCanvas | null;
  enabled: boolean;
  onRemoteChange?: () => void;
}

export function useRealtimeWhiteboard({
  whiteboardId,
  getCanvas,
  enabled,
  onRemoteChange,
}: UseRealtimeWhiteboardOptions) {
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const lastAppliedSnapshotKeyRef = useRef<string>('');
  const lastAppliedVersionRef = useRef<number>(-1);

  const applySnapshotToCanvas = useCallback((
    snapshot: any,
    version: number,
    source: 'db_load' | 'realtime'
  ) => {
    const canvas = getCanvas();
    if (!canvas) return;

    const snapshotKey = JSON.stringify(snapshot ?? {});
    if (snapshotKey === lastAppliedSnapshotKeyRef.current && version <= lastAppliedVersionRef.current) {
      return;
    }

    // Preserve viewport (pan/zoom) locally when applying remote snapshot
    const currentViewport = canvas.viewportTransform
      ? [...canvas.viewportTransform] as number[]
      : null;

    const canvasAny = canvas as any;
    canvasAny.__suppressOnObjectsChange = true;

    const jsonToLoad = snapshot && typeof snapshot === 'object'
      ? snapshot
      : { objects: [], background: "#000000" };

    canvas.loadFromJSON(jsonToLoad, () => {
      if (currentViewport) {
        canvas.setViewportTransform(currentViewport as any);
      }
      canvas.backgroundColor = "#000000";
      canvas.renderAll();
      canvasAny.__suppressOnObjectsChange = false;
    });

    lastAppliedSnapshotKeyRef.current = snapshotKey;
    lastAppliedVersionRef.current = typeof version === 'number' ? version : lastAppliedVersionRef.current;

    if (onRemoteChange && source === 'realtime') {
      onRemoteChange();
    }
  }, [getCanvas, onRemoteChange]);

  // Load snapshot from backend
  const loadSnapshotFromDB = useCallback(async (source: 'db_load' | 'realtime' = 'db_load') => {
    const currentCanvas = getCanvas();
    if (!whiteboardId || !currentCanvas) return;

    const startTime = Date.now();

    try {
      const data = await apiFetch<any>(`/whiteboards/${whiteboardId}`);

      console.log('[Realtime] Loading snapshot from DB', {
        whiteboardId,
        hasSnapshot: !!data?.canvas_snapshot,
        version: data?.snapshot_version,
      });

      const duration = Date.now() - startTime;
      console.log('[Realtime] Canvas snapshot sync from DB completed', {
        whiteboardId,
        durationMs: duration,
      });

      applySnapshotToCanvas(
        data?.canvas_snapshot ?? null,
        typeof data?.snapshot_version === 'number' ? data.snapshot_version : -1,
        source
      );
    } catch (error) {
      console.error('[Realtime] Error loading snapshot:', error);
    }
  }, [whiteboardId, getCanvas, applySnapshotToCanvas]);

  // Poll for changes
  useEffect(() => {
    if (!whiteboardId || !enabled) return;

    console.log('[Realtime] Polling whiteboard:', whiteboardId);

    loadSnapshotFromDB('db_load');
    pollRef.current = setInterval(() => {
      loadSnapshotFromDB('realtime');
    }, 3000);

    return () => {
      console.log('[Realtime] Stopping whiteboard polling');
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [whiteboardId, enabled, loadSnapshotFromDB]);

  return {
    loadSnapshotFromDB,
  };
}
