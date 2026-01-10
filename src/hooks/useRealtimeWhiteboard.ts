import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Canvas as FabricCanvas } from "fabric";
import { toast } from "sonner";

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
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
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

  // Load snapshot from database
  const loadSnapshotFromDB = useCallback(async () => {
    const currentCanvas = getCanvas();
    if (!whiteboardId || !currentCanvas) return;

    const startTime = Date.now();

    try {
      const { data, error } = await supabase
        .from('whiteboards')
        .select('id, canvas_snapshot, snapshot_version')
        .eq('id', whiteboardId)
        .maybeSingle();

      if (error) throw error;

      console.log('[Realtime] Loading snapshot from DB', {
        whiteboardId,
        hasSnapshot: !!(data as any)?.canvas_snapshot,
        version: (data as any)?.snapshot_version,
      });

      const duration = Date.now() - startTime;
      console.log('[Realtime] Canvas snapshot sync from DB completed', {
        whiteboardId,
        durationMs: duration,
      });

      applySnapshotToCanvas(
        (data as any)?.canvas_snapshot ?? null,
        typeof (data as any)?.snapshot_version === 'number' ? (data as any).snapshot_version : -1,
        'db_load'
      );
    } catch (error) {
      console.error('[Realtime] Error loading snapshot:', error);
    }
  }, [whiteboardId, getCanvas, applySnapshotToCanvas]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!whiteboardId || !enabled) return;

    console.log('[Realtime] Subscribing to whiteboard:', whiteboardId);

    const channel = supabase
      .channel(`whiteboard-${whiteboardId}`, {
        config: {
          broadcast: { self: false },
        },
      })
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whiteboards',
          filter: `id=eq.${whiteboardId}`,
        },
        (payload) => {
          console.log('[Realtime] Received snapshot change', {
            whiteboardId,
            eventType: payload.eventType,
          });

          const next = (payload as any).new;
          if (!next) return;

          // Debounce to batch rapid updates
          if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
          syncTimeoutRef.current = setTimeout(() => {
            applySnapshotToCanvas(
              next.canvas_snapshot ?? null,
              typeof next.snapshot_version === 'number' ? next.snapshot_version : -1,
              'realtime'
            );
          }, 80);
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          toast.success('Colaboração em tempo real ativada');
          // Sync initial state on subscribe
          loadSnapshotFromDB();
        }
      });

    // Helpful: log realtime channel errors
    channel.on('system', { event: '*' }, (payload) => {
      console.log('[Realtime] System event', payload);
    });

    channelRef.current = channel;

    return () => {
      console.log('[Realtime] Unsubscribing from whiteboard');
      supabase.removeChannel(channel);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      channelRef.current = null;
    };
  }, [whiteboardId, enabled, loadSnapshotFromDB, applySnapshotToCanvas]);

  return {
    loadSnapshotFromDB,
  };
}
