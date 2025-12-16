import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('mentions')
        .select(`
          *,
          comment:whiteboard_comments(
            id,
            content,
            whiteboard_id,
            user_id,
            author:profiles!whiteboard_comments_user_id_profiles_fkey(full_name),
            whiteboard:whiteboards(name)
          )
        `)
        .eq('mentioned_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Transform the data
      const transformedData = (data || []).map(item => ({
        ...item,
        comment: item.comment ? {
          ...item.comment,
          author: Array.isArray(item.comment.author) ? item.comment.author[0] : item.comment.author,
          whiteboard: Array.isArray(item.comment.whiteboard) ? item.comment.whiteboard[0] : item.comment.whiteboard
        } : undefined
      }));

      setMentions(transformedData);
      setUnreadCount(transformedData.filter(m => !m.read).length);
    } catch (error) {
      console.error('Error fetching mentions:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Subscribe to realtime updates
  useEffect(() => {
    fetchMentions();

    const setupChannel = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const channel = supabase
        .channel('mentions-notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'mentions',
            filter: `mentioned_user_id=eq.${user.id}`,
          },
          () => {
            fetchMentions();
          }
        )
        .subscribe();

      return channel;
    };

    let channel: ReturnType<typeof supabase.channel> | undefined;
    setupChannel().then(ch => { channel = ch; });

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchMentions]);

  const markAsRead = useCallback(async (mentionId: string) => {
    try {
      const { error } = await supabase
        .from('mentions')
        .update({ read: true })
        .eq('id', mentionId);

      if (error) throw error;
      
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('mentions')
        .update({ read: true })
        .eq('mentioned_user_id', user.id)
        .eq('read', false);

      if (error) throw error;
      
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
