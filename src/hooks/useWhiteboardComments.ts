import { useState, useCallback, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { WhiteboardSocket } from "@/lib/realtime/whiteboardSocket";
import { getAccessToken } from "@/lib/authTokens";
import { toast } from "sonner";

export interface Comment {
  id: string;
  whiteboard_id: string;
  object_id: string | null;
  user_id: string;
  content: string;
  position_x: number | null;
  position_y: number | null;
  resolved: boolean;
  parent_comment_id: string | null;
  created_at: string;
  updated_at: string;
  author?: {
    full_name: string | null;
    avatar_url: string | null;
  };
}

export interface Mention {
  id: string;
  comment_id: string;
  mentioned_user_id: string;
  read: boolean;
  created_at: string;
  comment?: Comment;
}

interface UseWhiteboardCommentsOptions {
  whiteboardId: string | null;
  enabled: boolean;
}

export function useWhiteboardComments({ whiteboardId, enabled }: UseWhiteboardCommentsOptions) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const socketRef = useRef<WhiteboardSocket | null>(null);

  const normalizeComment = useCallback((raw: any): Comment => {
    return {
      ...raw,
      position_x: raw?.position_x === null || raw?.position_x === undefined ? null : Number(raw.position_x),
      position_y: raw?.position_y === null || raw?.position_y === undefined ? null : Number(raw.position_y),
      resolved: Boolean(raw?.resolved),
    } as Comment;
  }, []);

  // Fetch comments for whiteboard
  const fetchComments = useCallback(async () => {
    if (!whiteboardId) return;
    
    setLoading(true);
    try {
      const data = await apiFetch<Comment[]>(`/whiteboards/${whiteboardId}/comments`);
      setComments((data || []).map(normalizeComment));
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoading(false);
    }
  }, [whiteboardId, normalizeComment]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!whiteboardId || !enabled) return;

    fetchComments();

    const interval = setInterval(() => {
      fetchComments();
    }, 30000);

    return () => clearInterval(interval);
  }, [whiteboardId, enabled, fetchComments]);

  useEffect(() => {
    if (!whiteboardId || !enabled) return;

    const socket = new WhiteboardSocket(
      {
        whiteboardId,
        clientId: `comments-${Math.random().toString(36).slice(2)}`,
        getToken: getAccessToken,
        getWsBaseUrl: () => {
          const base = import.meta.env.VITE_API_URL as string | undefined;
          return base ? base.replace(/^http/i, 'ws').replace(/\/$/, '') : null;
        },
        heartbeatMs: 20000,
        pongTimeoutMs: 60000,
      },
      {
        onSnapshot: () => {
          // Ignore whiteboard snapshots here.
        },
        onComment: (event) => {
          if (event.type === 'comment.created') {
            const comment = normalizeComment(event.comment);
            setComments((prev) => {
              if (prev.some((c) => c.id === comment.id)) return prev;
              return [...prev, comment];
            });
            return;
          }

          if (event.type === 'comment.updated') {
            const comment = normalizeComment(event.comment);
            setComments((prev) => prev.map((c) => (c.id === comment.id ? comment : c)));
            return;
          }

          if (event.type === 'comment.deleted') {
            setComments((prev) => prev.filter((c) => c.id !== event.commentId));
          }
        },
      }
    );

    socketRef.current = socket;
    socket.connect();

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [whiteboardId, enabled, normalizeComment]);

  // Create a new comment
  const createComment = useCallback(async (
    content: string,
    objectId?: string,
    positionX?: number,
    positionY?: number,
    parentCommentId?: string
  ) => {
    if (!whiteboardId) return null;

    try {
      // Extract mentions from content
      const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
      const mentions: { userId: string; name: string }[] = [];
      let match;
      while ((match = mentionRegex.exec(content)) !== null) {
        mentions.push({ name: match[1], userId: match[2] });
      }

      const comment = await apiFetch<Comment>(`/whiteboards/${whiteboardId}/comments`, {
        method: 'POST',
        body: {
          content,
          object_id: objectId || null,
          position_x: positionX || null,
          position_y: positionY || null,
          parent_comment_id: parentCommentId || null,
          mentions: mentions.map(m => m.userId),
        },
      });

      const normalized = normalizeComment(comment);
      setComments(prev => {
        if (prev.some(c => c.id === normalized.id)) return prev;
        return [...prev, normalized];
      });

      toast.success('Comentário adicionado');
      return comment;
    } catch (error) {
      console.error('Error creating comment:', error);
      toast.error('Erro ao criar comentário');
      return null;
    }
  }, [whiteboardId, normalizeComment]);

  // Update a comment
  const updateComment = useCallback(async (commentId: string, content: string) => {
    if (!whiteboardId) return false;
    try {
      const updated = await apiFetch<Comment>(`/whiteboards/${whiteboardId}/comments/${commentId}`, {
        method: 'PUT',
        body: { content },
      });
      const normalized = normalizeComment(updated);
      setComments(prev => prev.map(c => (c.id === commentId ? { ...c, ...normalized } : c)));
      return true;
    } catch (error) {
      console.error('Error updating comment:', error);
      toast.error('Erro ao atualizar comentário');
      return false;
    }
  }, [whiteboardId, normalizeComment]);

  // Delete a comment
  const deleteComment = useCallback(async (commentId: string) => {
    if (!whiteboardId) return false;
    try {
      await apiFetch(`/whiteboards/${whiteboardId}/comments/${commentId}`, { method: 'DELETE' });
      toast.success('Comentário excluído');
      setComments(prev => prev.filter(c => c.id !== commentId));
      return true;
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error('Erro ao excluir comentário');
      return false;
    }
  }, [whiteboardId]);

  // Resolve/unresolve a comment
  const toggleResolved = useCallback(async (commentId: string, resolved: boolean) => {
    if (!whiteboardId) return false;
    try {
      const updated = await apiFetch<Comment>(`/whiteboards/${whiteboardId}/comments/${commentId}`, {
        method: 'PUT',
        body: { resolved },
      });
      const normalized = normalizeComment(updated);
      setComments(prev => prev.map(c => (c.id === commentId ? { ...c, ...normalized } : c)));
      return true;
    } catch (error) {
      console.error('Error toggling resolved:', error);
      return false;
    }
  }, [whiteboardId, normalizeComment]);

  // Get comments for a specific object
  const getCommentsForObject = useCallback((objectId: string) => {
    return comments.filter(c => c.object_id === objectId);
  }, [comments]);

  return {
    comments,
    loading,
    createComment,
    updateComment,
    deleteComment,
    toggleResolved,
    getCommentsForObject,
    fetchComments,
  };
}
