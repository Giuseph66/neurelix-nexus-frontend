import { useState } from "react";
import { X, Check, Trash2, Reply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MentionInput } from "./MentionInput";
import { Comment } from "@/hooks/useWhiteboardComments";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CommentThreadProps {
  comments: Comment[];
  onClose: () => void;
  onAddComment: (content: string, parentId?: string) => Promise<unknown>;
  onDeleteComment: (commentId: string) => Promise<unknown>;
  onResolve: (commentId: string, resolved: boolean) => Promise<unknown>;
  currentUserId: string | null;
  projectId?: string;
}

export function CommentThread({
  comments,
  onClose,
  onAddComment,
  onDeleteComment,
  onResolve,
  currentUserId,
  projectId,
}: CommentThreadProps) {
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const rootComments = comments.filter(c => !c.parent_comment_id);
  const getReplies = (commentId: string) => comments.filter(c => c.parent_comment_id === commentId);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    await onAddComment(newComment, replyingTo || undefined);
    setNewComment("");
    setReplyingTo(null);
    setSubmitting(false);
  };

  // Render mentions as highlighted text
  const renderContent = (content: string) => {
    const mentionRegex = /@(\w+(?:\s+\w+)?)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }
      parts.push(
        <span key={match.index} className="text-primary font-medium">
          {match[0]}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }

    return parts;
  };

  const renderComment = (comment: Comment, isReply = false) => {
    const replies = getReplies(comment.id);
    const isOwner = comment.user_id === currentUserId;

    return (
      <div key={comment.id} className={`${isReply ? 'ml-6 mt-2' : 'mt-3'}`}>
        <div className={`p-3 rounded-lg ${comment.resolved ? 'bg-muted/50 opacity-60' : 'bg-muted'}`}>
          <div className="flex items-start gap-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[10px]">
                {comment.author?.full_name?.substring(0, 2).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">
                  {comment.author?.full_name || 'Usuário'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(comment.created_at), { 
                    addSuffix: true, 
                    locale: ptBR 
                  })}
                </span>
              </div>
              <p className="text-sm mt-1 whitespace-pre-wrap break-words">
                {renderContent(comment.content)}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 mt-2">
            {!isReply && !comment.resolved && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setReplyingTo(comment.id)}
              >
                <Reply className="h-3 w-3 mr-1" />
                Responder
              </Button>
            )}
            {!isReply && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => onResolve(comment.id, !comment.resolved)}
              >
                <Check className="h-3 w-3 mr-1" />
                {comment.resolved ? 'Reabrir' : 'Resolver'}
              </Button>
            )}
            {isOwner && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                onClick={() => onDeleteComment(comment.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {replies.map(reply => renderComment(reply, true))}
      </div>
    );
  };

  return (
    <div className="w-80 bg-card border rounded-lg shadow-xl flex flex-col max-h-[400px]">
      <div className="p-3 border-b flex items-center justify-between">
        <span className="font-medium text-sm">Comentários ({comments.length})</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-3">
        {rootComments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum comentário ainda
          </p>
        ) : (
          rootComments.map(comment => renderComment(comment))
        )}
      </ScrollArea>

      <div className="p-3 border-t">
        {replyingTo && (
          <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
            <span>Respondendo...</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1"
              onClick={() => setReplyingTo(null)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
        <MentionInput
          value={newComment}
          onChange={setNewComment}
          placeholder="Escreva um comentário... Use @nome para mencionar"
          className="min-h-[60px] text-sm resize-none"
          projectId={projectId}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleSubmit();
            }
          }}
        />
        <Button
          className="w-full mt-2"
          size="sm"
          onClick={handleSubmit}
          disabled={!newComment.trim() || submitting}
        >
          {submitting ? 'Enviando...' : 'Enviar'}
        </Button>
      </div>
    </div>
  );
}
