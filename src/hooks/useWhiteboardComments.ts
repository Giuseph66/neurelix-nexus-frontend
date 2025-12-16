import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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

  // Fetch comments for whiteboard
  const fetchComments = useCallback(async () => {
    if (!whiteboardId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whiteboard_comments')
        .select(`
          *,
          author:profiles!whiteboard_comments_user_id_profiles_fkey(full_name, avatar_url)
        `)
        .eq('whiteboard_id', whiteboardId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      // Transform the data to match our interface
      const transformedData = (data || []).map(item => ({
        ...item,
        author: Array.isArray(item.author) ? item.author[0] : item.author
      }));
      
      setComments(transformedData);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoading(false);
    }
  }, [whiteboardId]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!whiteboardId || !enabled) return;

    fetchComments();

    const channel = supabase
      .channel(`comments-${whiteboardId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whiteboard_comments',
          filter: `whiteboard_id=eq.${whiteboardId}`,
        },
        () => {
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [whiteboardId, enabled, fetchComments]);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Extract mentions from content
      const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
      const mentions: { userId: string; name: string }[] = [];
      let match;
      while ((match = mentionRegex.exec(content)) !== null) {
        mentions.push({ name: match[1], userId: match[2] });
      }

      const { data: comment, error } = await supabase
        .from('whiteboard_comments')
        .insert({
          whiteboard_id: whiteboardId,
          object_id: objectId || null,
          user_id: user.id,
          content,
          position_x: positionX || null,
          position_y: positionY || null,
          parent_comment_id: parentCommentId || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Create mentions
      if (mentions.length > 0 && comment) {
        const mentionsToInsert = mentions.map(m => ({
          comment_id: comment.id,
          mentioned_user_id: m.userId,
        }));

        await supabase.from('mentions').insert(mentionsToInsert);
      }

      toast.success('Comentário adicionado');
      return comment;
    } catch (error) {
      console.error('Error creating comment:', error);
      toast.error('Erro ao criar comentário');
      return null;
    }
  }, [whiteboardId]);

  // Update a comment
  const updateComment = useCallback(async (commentId: string, content: string) => {
    try {
      const { error } = await supabase
        .from('whiteboard_comments')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', commentId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating comment:', error);
      toast.error('Erro ao atualizar comentário');
      return false;
    }
  }, []);

  // Delete a comment
  const deleteComment = useCallback(async (commentId: string) => {
    try {
      const { error } = await supabase
        .from('whiteboard_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      toast.success('Comentário excluído');
      return true;
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error('Erro ao excluir comentário');
      return false;
    }
  }, []);

  // Resolve/unresolve a comment
  const toggleResolved = useCallback(async (commentId: string, resolved: boolean) => {
    try {
      const { error } = await supabase
        .from('whiteboard_comments')
        .update({ resolved })
        .eq('id', commentId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error toggling resolved:', error);
      return false;
    }
  }, []);

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
