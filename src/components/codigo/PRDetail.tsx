import { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  GitPullRequest,
  ExternalLink,
  GitBranch,
  GitCommit,
  FileText,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Check,
  X,
  MessageCircle,
} from 'lucide-react';
import { usePR, useSubmitReview, useCreatePRComment, useMergePR } from '@/hooks/usePRs';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function PRDetail() {
  const { repoId, prNumber: prNumberStr } = useParams<{ 
    repoId: string; 
    prNumber: string;
  }>();
  const location = useLocation();
  const navigate = useNavigate();
  const prNumber = prNumberStr ? parseInt(prNumberStr, 10) : undefined;
  const [activeTab, setActiveTab] = useState('commits');
  
  // Extrair projectId da URL: /project/:projectId/code/...
  const projectIdMatch = location.pathname.match(/\/project\/([^/]+)/);
  const projectId = projectIdMatch ? projectIdMatch[1] : undefined;

  const { data, isLoading, error } = usePR(repoId, prNumber);
  const submitReview = useSubmitReview();
  const createComment = useCreatePRComment();
  const mergePR = useMergePR();
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewState, setReviewState] = useState<'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED'>('COMMENTED');
  const [reviewBody, setReviewBody] = useState('');
  const [commentBody, setCommentBody] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <p className="text-destructive mb-4">
          {error instanceof Error ? error.message : 'Erro ao carregar Pull Request'}
        </p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Voltar
        </Button>
      </div>
    );
  }

  const { pr, linked_tarefas } = data;

  const getStateBadge = () => {
    if (pr.state === 'MERGED') {
      return <Badge className="bg-purple-600">Merged</Badge>;
    }
    if (pr.state === 'CLOSED') {
      return <Badge variant="secondary">Closed</Badge>;
    }
    return <Badge className="bg-green-600">Open</Badge>;
  };

  const getReviewSummary = () => {
    if (!pr.reviews || pr.reviews.length === 0) {
      return { approved: 0, changesRequested: 0, commented: 0 };
    }
    return {
      approved: pr.reviews.filter((r: any) => r.state === 'APPROVED').length,
      changesRequested: pr.reviews.filter((r: any) => r.state === 'CHANGES_REQUESTED').length,
      commented: pr.reviews.filter((r: any) => r.state === 'COMMENTED').length,
    };
  };

  const reviewSummary = getReviewSummary();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-4 space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-semibold">
                {pr.title}
              </h1>
              {getStateBadge()}
              {pr.draft && <Badge variant="secondary">Draft</Badge>}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Avatar className="h-5 w-5">
                  <AvatarFallback>{pr.author_username?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span>{pr.author_username}</span>
              </div>
              <span>
                Criado {formatDistanceToNow(new Date(pr.created_at), { addSuffix: true, locale: ptBR })}
              </span>
              {pr.updated_at !== pr.created_at && (
                <span>
                  Atualizado {formatDistanceToNow(new Date(pr.updated_at), { addSuffix: true, locale: ptBR })}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pr.state === 'OPEN' && (
              <>
                <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setReviewState('APPROVED');
                        setReviewBody('');
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Aprovar
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Submeter Review</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <Button
                          variant={reviewState === 'APPROVED' ? 'default' : 'outline'}
                          onClick={() => setReviewState('APPROVED')}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Aprovar
                        </Button>
                        <Button
                          variant={reviewState === 'CHANGES_REQUESTED' ? 'default' : 'outline'}
                          onClick={() => setReviewState('CHANGES_REQUESTED')}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Solicitar alterações
                        </Button>
                        <Button
                          variant={reviewState === 'COMMENTED' ? 'default' : 'outline'}
                          onClick={() => setReviewState('COMMENTED')}
                        >
                          <MessageCircle className="h-4 w-4 mr-2" />
                          Comentar
                        </Button>
                      </div>
                      <Textarea
                        placeholder="Adicione um comentário (opcional)"
                        value={reviewBody}
                        onChange={(e) => setReviewBody(e.target.value)}
                        rows={4}
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
                          Cancelar
                        </Button>
                        <Button
                          onClick={async () => {
                            if (repoId && prNumber) {
                              await submitReview.mutateAsync({
                                repoId,
                                prNumber,
                                state: reviewState,
                                body: reviewBody || undefined,
                              });
                              setReviewDialogOpen(false);
                              setReviewBody('');
                            }
                          }}
                          disabled={submitReview.isPending}
                        >
                          {submitReview.isPending ? 'Enviando...' : 'Submeter'}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Comentar
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adicionar Comentário</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Textarea
                        placeholder="Escreva seu comentário..."
                        value={commentBody}
                        onChange={(e) => setCommentBody(e.target.value)}
                        rows={6}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          onClick={async () => {
                            if (repoId && prNumber && commentBody) {
                              await createComment.mutateAsync({
                                repoId,
                                prNumber,
                                body: commentBody,
                              });
                              setCommentBody('');
                            }
                          }}
                          disabled={createComment.isPending || !commentBody}
                        >
                          {createComment.isPending ? 'Enviando...' : 'Comentar'}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                {projectId && repoId && prNumber && (
                  <Button
                    variant="default"
                    onClick={async () => {
                      if (confirm('Tem certeza que deseja fazer merge deste PR?')) {
                        await mergePR.mutateAsync({
                          repoId,
                          prNumber,
                          method: 'MERGE',
                        });
                      }
                    }}
                    disabled={mergePR.isPending || pr.state !== 'OPEN'}
                  >
                    {mergePR.isPending ? 'Fazendo merge...' : 'Fazer Merge'}
                  </Button>
                )}
              </>
            )}
            <Button
              variant="outline"
              onClick={() => window.open(pr.url, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Abrir no GitHub
            </Button>
          </div>
        </div>

        {/* Branches */}
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono">{pr.target_branch}</span>
          </div>
          <span className="text-muted-foreground">←</span>
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono">{pr.source_branch}</span>
          </div>
        </div>

        {/* Review Summary */}
        {(reviewSummary.approved > 0 || reviewSummary.changesRequested > 0 || reviewSummary.commented > 0) && (
          <div className="flex items-center gap-4 text-sm">
            {reviewSummary.approved > 0 && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span>{reviewSummary.approved} aprovado{reviewSummary.approved !== 1 ? 's' : ''}</span>
              </div>
            )}
            {reviewSummary.changesRequested > 0 && (
              <div className="flex items-center gap-1 text-orange-600">
                <XCircle className="h-4 w-4" />
                <span>{reviewSummary.changesRequested} alteração{reviewSummary.changesRequested !== 1 ? 'ões' : ''} solicitada{reviewSummary.changesRequested !== 1 ? 's' : ''}</span>
              </div>
            )}
            {reviewSummary.commented > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <MessageCircle className="h-4 w-4" />
                <span>{reviewSummary.commented} comentário{reviewSummary.commented !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        )}

        {/* Linked Tarefas */}
        {linked_tarefas && linked_tarefas.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Tarefas vinculadas:</span>
            {linked_tarefas.map((tarefa: any) => (
              <Badge 
                key={tarefa.id} 
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80"
                onClick={() => {
                  // TODO: Navegar para tarefa
                }}
              >
                {tarefa.key}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="border-b px-4">
            <TabsList>
              <TabsTrigger value="description">Descrição</TabsTrigger>
              <TabsTrigger value="commits">
                Commits
                {pr.commits && pr.commits.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{pr.commits.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="files">
                Arquivos
                {pr.files && pr.files.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{pr.files.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="reviews">
                Reviews
                {pr.reviews && pr.reviews.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{pr.reviews.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4">
              <TabsContent value="description" className="mt-4">
                {pr.description ? (
                  <Card>
                    <CardContent className="p-4">
                      <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                        {pr.description}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <p className="text-muted-foreground">Sem descrição</p>
                )}
              </TabsContent>

              <TabsContent value="commits" className="mt-4">
                {pr.commits && pr.commits.length > 0 ? (
                  <div className="space-y-2">
                    {pr.commits.map((commit: any) => (
                      <Card key={commit.sha}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-medium">{commit.message}</p>
                              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <GitCommit className="h-3 w-3" />
                                  <span className="font-mono text-xs">{commit.sha.substring(0, 7)}</span>
                                </div>
                                <span>{commit.author}</span>
                                <span>{format(new Date(commit.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">Nenhum commit</p>
                )}
              </TabsContent>

              <TabsContent value="files" className="mt-4">
                {pr.files && pr.files.length > 0 ? (
                  <div className="space-y-2">
                    {pr.files.map((file: any) => (
                      <Card key={file.filename}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-mono">{file.filename}</CardTitle>
                            <div className="flex items-center gap-2">
                              {file.status === 'added' && <Badge className="bg-green-600">+{file.additions}</Badge>}
                              {file.status === 'removed' && <Badge variant="destructive">-{file.deletions}</Badge>}
                              {file.status === 'modified' && (
                                <>
                                  <Badge className="bg-green-600">+{file.additions}</Badge>
                                  <Badge variant="destructive">-{file.deletions}</Badge>
                                </>
                              )}
                              <Badge variant="outline">{file.changes} mudanças</Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">
                            {file.patch ? `${file.patch.split('\n').length} linhas de diff` : 'Sem diff disponível'}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">Nenhum arquivo alterado</p>
                )}
              </TabsContent>

              <TabsContent value="reviews" className="mt-4">
                {pr.reviews && pr.reviews.length > 0 ? (
                  <div className="space-y-4">
                    {pr.reviews.map((review: any) => (
                      <Card key={review.id}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>{review.reviewer?.[0]?.toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{review.reviewer}</p>
                                <p className="text-sm text-muted-foreground">
                                  {review.submitted_at && formatDistanceToNow(new Date(review.submitted_at), { addSuffix: true, locale: ptBR })}
                                </p>
                              </div>
                            </div>
                            <div>
                              {review.state === 'APPROVED' && (
                                <Badge className="bg-green-600">
                                  <Check className="h-3 w-3 mr-1" />
                                  Aprovado
                                </Badge>
                              )}
                              {review.state === 'CHANGES_REQUESTED' && (
                                <Badge variant="destructive">
                                  <X className="h-3 w-3 mr-1" />
                                  Alterações solicitadas
                                </Badge>
                              )}
                              {review.state === 'COMMENTED' && (
                                <Badge variant="secondary">
                                  <MessageCircle className="h-3 w-3 mr-1" />
                                  Comentado
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        {review.body && (
                          <CardContent>
                            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                              {review.body}
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">Nenhum review ainda</p>
                )}
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </div>
    </div>
  );
}

