import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export interface Notification {
  id: string;
  comment_id: string;
  mentioned_user_id: string;
  read: boolean;
  created_at: string;
  comment?: {
    id: string;
    content: string;
    whiteboard_id: string;
    user_id: string;
    author?: {
      full_name: string | null;
    };
    whiteboard?: {
      name: string;
    };
  };
}

export function useMentions() {
  const [mentions, setMentions] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchMentions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Notification[]>('/mentions');
      setMentions(data || []);
      setUnreadCount((data || []).filter(m => !m.read).length);
    } catch (error) {
      console.error('Error fetching mentions:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh on mount
  useEffect(() => {
    fetchMentions();
  }, [fetchMentions]);

  const markAsRead = useCallback(async (mentionId: string) => {
    try {
      await apiFetch(`/mentions/${mentionId}`, { method: 'PUT' });
      
      setMentions(prev => prev.map(m => 
        m.id === mentionId ? { ...m, read: true } : m
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking mention as read:', error);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await apiFetch('/mentions/read-all', { method: 'PUT' });
      
      setMentions(prev => prev.map(m => ({ ...m, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }, []);

  return {
    mentions,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    fetchMentions,
  };
}
