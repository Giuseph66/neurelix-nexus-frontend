import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Collaborator {
  id: string;
  userId: string;
  name: string;
  color: string;
  cursorX: number | null;
  cursorY: number | null;
  lastSeen: string;
}

interface UseWhiteboardPresenceOptions {
  whiteboardId: string | null;
  enabled: boolean;
}

// Generate a random color for the user
function generateUserColor(): string {
  const colors = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#F97316', // Orange
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export function useWhiteboardPresence({ 
  whiteboardId, 
  enabled 
}: UseWhiteboardPresenceOptions) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('Anônimo');
  const userColorRef = useRef(generateUserColor());
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        
        // Get user profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (profile?.full_name) {
          setUserName(profile.full_name);
        } else if (user.email) {
          setUserName(user.email.split('@')[0]);
        }
      }
    };
    getUser();
  }, []);

  // Subscribe to presence
  useEffect(() => {
    if (!whiteboardId || !enabled || !currentUserId) return;

    console.log('[Presence] Setting up presence for:', whiteboardId);

    const channel = supabase.channel(`presence-${whiteboardId}`, {
      config: {
        presence: {
          key: currentUserId,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        console.log('[Presence] Sync:', state);
        
        const users: Collaborator[] = [];
        
        Object.keys(state).forEach(key => {
          const presences = state[key] as any[];
          presences.forEach(presence => {
            if (presence.user_id !== currentUserId) {
              users.push({
                id: key,
                userId: presence.user_id,
                name: presence.name || 'Anônimo',
                color: presence.color || '#3B82F6',
                cursorX: presence.cursor_x,
                cursorY: presence.cursor_y,
                lastSeen: new Date().toISOString(),
              });
            }
          });
        });
        
        setCollaborators(users);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('[Presence] Join:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('[Presence] Leave:', key, leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: currentUserId,
            name: userName,
            color: userColorRef.current,
            cursor_x: null,
            cursor_y: null,
            online_at: new Date().toISOString(),
          });
        }
      });

    presenceChannelRef.current = channel;

    return () => {
      console.log('[Presence] Cleaning up presence');
      supabase.removeChannel(channel);
      presenceChannelRef.current = null;
    };
  }, [whiteboardId, enabled, currentUserId, userName]);

  // Update cursor position
  const updateCursor = useCallback((x: number | null, y: number | null) => {
    if (!presenceChannelRef.current || !currentUserId) return;

    presenceChannelRef.current.track({
      user_id: currentUserId,
      name: userName,
      color: userColorRef.current,
      cursor_x: x,
      cursor_y: y,
      online_at: new Date().toISOString(),
    });
  }, [currentUserId, userName]);

  return {
    collaborators,
    currentUserId,
    userColor: userColorRef.current,
    updateCursor,
  };
}
