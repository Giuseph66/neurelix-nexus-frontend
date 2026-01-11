import { useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

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
  const collaborators: Collaborator[] = [];
  const userColorRef = useRef(generateUserColor());
  void whiteboardId;
  void enabled;

  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  // Update cursor position
  const updateCursor = useCallback((x: number | null, y: number | null) => {
    void x;
    void y;
  }, []);

  return {
    collaborators,
    currentUserId,
    userColor: userColorRef.current,
    updateCursor,
  };
}
