import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, ThumbsUp, ThumbsDown, Reply, X, AlertTriangle, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PRComment } from '@/types/codigo';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

interface CommentThreadProps {
    comments: PRComment[];
    onReply: (body: string) => Promise<void>;
    onResolve?: (resolution: 'RESOLVED' | 'WONT_FIX', reason?: string) => Promise<void>;
    onReaction?: (commentId: string, reaction: 'like' | 'dislike' | 'contra', reason?: string) => Promise<void>;
    isResolved?: boolean;
    canResolve?: boolean;
    isDraft?: boolean;
    onCancel?: () => void;
}

export function CommentThread({ comments, onReply, onResolve, onReaction, isResolved = false, canResolve = false, isDraft = false, onCancel }: CommentThreadProps) {
    const [isReplying, setIsReplying] = useState(isDraft);
    const [replyBody, setReplyBody] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [contraReason, setContraReason] = useState('');
    const [resolveReason, setResolveReason] = useState('');
    const [wontFixReason, setWontFixReason] = useState('');

    const handleSubmitReply = async () => {
        if (!replyBody.trim()) return;
        setIsSubmitting(true);
        try {
            await onReply(replyBody);
            setReplyBody('');
            if (!isDraft) {
                setIsReplying(false);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    if ((!comments || comments.length === 0) && !isDraft) return null;

    const threadResolution = (comments?.[0] as any)?.thread_resolution as PRComment['thread_resolution'] | undefined | null;

    return (
        <div className={cn("border rounded-md bg-background shadow-sm my-2 mx-4 overflow-hidden", isDraft && "border-blue-200 ring-1 ring-blue-100")}>
            {!isDraft && (
                <div className="bg-muted/30 p-2 flex items-center justify-between border-b">
                    <span className="text-xs font-medium text-muted-foreground">
                        Comentários na linha {comments[0].line_number}
                    </span>
                    {threadResolution && (
                        <div className={cn(
                            "flex items-center gap-2 text-xs font-medium px-2",
                            threadResolution.resolution === 'RESOLVED' ? "text-green-600" : "text-orange-600"
                        )}>
                            {threadResolution.resolution === 'RESOLVED' ? (
                                <>
                                    <CheckCircle2 className="h-3 w-3" />
                                    Resolvido
                                </>
                            ) : (
                                <>
                                    <Ban className="h-3 w-3" />
                                    Não corrigir
                                </>
                            )}
                            <span className="text-muted-foreground font-normal">
                                — {threadResolution.reason}
                                {threadResolution.resolved_by_name ? ` (${threadResolution.resolved_by_name})` : ''}
                            </span>
                        </div>
                    )}
                    {canResolve && onResolve && (
                        <div className="flex gap-1">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-xs gap-1 text-muted-foreground hover:text-green-600"
                                    >
                                        <CheckCircle2 className="h-3 w-3" />
                                        Resolver
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80">
                                    <div className="space-y-2">
                                        <h4 className="font-medium leading-none">Motivo do resolve</h4>
                                        <Textarea
                                            placeholder="Explique por que foi resolvido..."
                                            value={resolveReason}
                                            onChange={(e) => setResolveReason(e.target.value)}
                                            className="h-20"
                                        />
                                        <Button
                                            size="sm"
                                            className="w-full"
                                            onClick={() => {
                                                if (!resolveReason.trim()) return;
                                                onResolve('RESOLVED', resolveReason.trim());
                                                setResolveReason('');
                                            }}
                                        >
                                            Confirmar
                                        </Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-xs gap-1 text-muted-foreground hover:text-orange-600"
                                    >
                                        <Ban className="h-3 w-3" />
                                        Não corrigir
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80">
                                    <div className="space-y-2">
                                        <h4 className="font-medium leading-none">Motivo para não corrigir</h4>
                                        <Textarea
                                            placeholder="Explique por que não será corrigido..."
                                            value={wontFixReason}
                                            onChange={(e) => setWontFixReason(e.target.value)}
                                            className="h-20"
                                        />
                                        <Button
                                            size="sm"
                                            className="w-full"
                                            onClick={() => {
                                                if (!wontFixReason.trim()) return;
                                                onResolve('WONT_FIX', wontFixReason.trim());
                                                setWontFixReason('');
                                            }}
                                        >
                                            Confirmar
                                        </Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}
                </div>
            )}

            <div className="divide-y">
                {comments.map((comment) => (
                    <div key={comment.id} className="p-3">
                        <div className="flex items-start gap-3">
                            <Avatar className="h-6 w-6 mt-1">
                                <AvatarFallback>{comment.author_username?.[0]?.toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 space-y-1">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">{comment.author_username}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: ptBR })}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                                    {comment.body}
                                </div>
                                {comment.local_reactions?.contra_reasons && comment.local_reactions.contra_reasons.length > 0 && (
                                    <div className="mt-2 text-xs text-muted-foreground space-y-1">
                                        <div className="font-medium text-orange-600 flex items-center gap-1">
                                            <AlertTriangle className="h-3 w-3" />
                                            Contras
                                        </div>
                                        {comment.local_reactions.contra_reasons.slice(0, 3).map((r, idx) => (
                                            <div key={`${comment.id}-contra-${idx}`} className="pl-4">
                                                - {r.reason}{r.user_name ? ` (${r.user_name})` : ''}
                                            </div>
                                        ))}
                                        {comment.local_reactions.contra_reasons.length > 3 && (
                                            <div className="pl-4">+{comment.local_reactions.contra_reasons.length - 3} mais…</div>
                                        )}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex items-center gap-2 mt-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={cn(
                                            "h-6 w-6 hover:text-green-600",
                                            comment.local_reactions?.my === 'like' ? "text-green-600" : "text-muted-foreground"
                                        )}
                                        onClick={() => onReaction?.(comment.id, 'like')}
                                        title="Concordo / Like"
                                    >
                                        <ThumbsUp className="h-3 w-3" />
                                    </Button>
                                    {comment.local_reactions?.counts?.like ? (
                                        <span className="text-[10px] text-muted-foreground">{comment.local_reactions.counts.like}</span>
                                    ) : null}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={cn(
                                            "h-6 w-6 hover:text-red-600",
                                            comment.local_reactions?.my === 'dislike' ? "text-red-600" : "text-muted-foreground"
                                        )}
                                        onClick={() => onReaction?.(comment.id, 'dislike')}
                                        title="Discordo / Dislike"
                                    >
                                        <ThumbsDown className="h-3 w-3" />
                                    </Button>
                                    {comment.local_reactions?.counts?.dislike ? (
                                        <span className="text-[10px] text-muted-foreground">{comment.local_reactions.counts.dislike}</span>
                                    ) : null}
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className={cn(
                                                    "h-6 w-6 hover:text-orange-600",
                                                    comment.local_reactions?.my === 'contra' ? "text-orange-600" : "text-muted-foreground"
                                                )}
                                                title="Contra (com motivo)"
                                            >
                                                <AlertTriangle className="h-3 w-3" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-80">
                                            <div className="space-y-2">
                                                <h4 className="font-medium leading-none">Argumento Contra</h4>
                                                <Input
                                                    placeholder="Por que você é contra?"
                                                    value={contraReason}
                                                    onChange={(e) => setContraReason(e.target.value)}
                                                />
                                                <Button
                                                    size="sm"
                                                    className="w-full"
                                                    onClick={() => {
                                                        if (!contraReason.trim()) return;
                                                        onReaction?.(comment.id, 'contra', contraReason.trim());
                                                        setContraReason('');
                                                    }}
                                                >
                                                    Enviar
                                                </Button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                    {comment.local_reactions?.counts?.contra ? (
                                        <span className="text-[10px] text-muted-foreground">{comment.local_reactions.counts.contra}</span>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Reply Section */}
            <div className={cn("p-3 border-t", isDraft ? "bg-background" : "bg-muted/10")}>
                {isReplying ? (
                    <div className="space-y-2">
                        <Textarea
                            placeholder={isDraft ? "Escreva seu comentário..." : "Escreva sua resposta..."}
                            value={replyBody}
                            onChange={(e) => setReplyBody(e.target.value)}
                            className="min-h-[80px] text-sm"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    if (isDraft && onCancel) {
                                        onCancel();
                                    } else {
                                        setIsReplying(false);
                                    }
                                }}
                                disabled={isSubmitting}
                            >
                                Cancelar
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleSubmitReply}
                                disabled={!replyBody.trim() || isSubmitting}
                            >
                                {isSubmitting ? 'Enviando...' : (isDraft ? 'Comentar' : 'Responder')}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground text-xs"
                        onClick={() => setIsReplying(true)}
                    >
                        <Reply className="h-3 w-3 mr-1" />
                        Responder
                    </Button>
                )}
            </div>
        </div>
    );
}
