import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useTarefa,
  useTarefaComments,
  useTarefaActivity,
  useUpdateTarefa,
  useCreateComment,
} from '@/hooks/useTarefas';
import { PRIORITY_CONFIG, TYPE_CONFIG, type UpdateTarefaInput, type TarefaType } from '@/types/tarefas';
import {
  Calendar,
  User,
  Tag,
  Clock,
  MessageSquare,
  History,
  ExternalLink,
  GitBranch,
  Layout,
  Send,
  Code2,
  GitPullRequest,
  GitCommit,
  Pencil,
  X,
  Zap,
} from 'lucide-react';
import { useTarefaGitLinks } from '@/hooks/useTarefaGitLinks';
import { useProjectMembers } from '@/hooks/useProjectMembers';
import { useEpics } from '@/hooks/useBacklog';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TarefaDetailModalProps {
  tarefaId: string | null;
  onClose: () => void;
}

export function TarefaDetailModal({ tarefaId, onClose }: TarefaDetailModalProps) {
  const navigate = useNavigate();
  const { data: tarefa, isLoading: tarefaLoading } = useTarefa(tarefaId || undefined);
  const { data: comments, isLoading: commentsLoading } = useTarefaComments(tarefaId || undefined);
  const { data: activity, isLoading: activityLoading } = useTarefaActivity(tarefaId || undefined);
  const { data: gitLinksData, isLoading: gitLinksLoading } = useTarefaGitLinks(tarefaId || undefined);
  const { data: members } = useProjectMembers(tarefa?.project_id);
  const { data: epics } = useEpics(tarefa?.project_id);
  
  const updateTarefa = useUpdateTarefa();
  const createComment = useCreateComment();

  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedPriority, setEditedPriority] = useState<UpdateTarefaInput['priority']>('MEDIUM');
  const [editedAssigneeId, setEditedAssigneeId] = useState<string>('none');
  const [editedEpicId, setEditedEpicId] = useState<string>('none');
  const [editedDueDate, setEditedDueDate] = useState<string>(''); // yyyy-mm-dd
  const [editedEstimatedHours, setEditedEstimatedHours] = useState<string>(''); // keep string for input
  const [editedLabels, setEditedLabels] = useState<string[]>([]);
  const [newLabelInput, setNewLabelInput] = useState('');
  const [newComment, setNewComment] = useState('');

  // Helper: extract type from labels (if any label matches a type)
  const getTypeFromLabels = (labels: string[]): TarefaType | undefined => {
    const typeLabels = ['EPIC', 'STORY', 'TASK', 'SUBTASK', 'BUG'];
    for (const label of labels) {
      const upperLabel = label.toUpperCase();
      if (typeLabels.includes(upperLabel)) {
        return upperLabel as TarefaType;
      }
    }
    return undefined;
  };

  const handleSave = async () => {
    if (!tarefaId) return;
    
    const input: UpdateTarefaInput = {};
    if (editedTitle !== tarefa?.title) input.title = editedTitle;
    if (editedDescription !== tarefa?.description) input.description = editedDescription;
    if (editedPriority && editedPriority !== tarefa?.priority) input.priority = editedPriority as any;

    // Extract type from labels if present
    const inferredType = getTypeFromLabels(editedLabels);
    if (inferredType) {
      // Always update type if we have a type label
      if (inferredType !== tarefa?.type) {
        input.type = inferredType;
      }
    } else {
      // If no type label found, default to TASK if no type was set before
      if (!tarefa?.type || tarefa.type !== 'TASK') {
        input.type = 'TASK';
      }
    }

    const assigneeToSend = editedAssigneeId === 'none' ? null : editedAssigneeId;
    if (assigneeToSend !== (tarefa?.assignee_id ?? null)) input.assignee_id = assigneeToSend;

    const epicToSend = editedEpicId === 'none' ? null : editedEpicId;
    if (epicToSend !== (tarefa?.epic_id ?? null)) input.epic_id = epicToSend;

    const dueToSend = editedDueDate ? editedDueDate : null;
    if (dueToSend !== (tarefa?.due_date ?? null)) input.due_date = dueToSend;

    const estToSend = editedEstimatedHours.trim() === '' ? null : Number(editedEstimatedHours);
    if (estToSend !== (tarefa?.estimated_hours ?? null)) input.estimated_hours = estToSend;

    // Compare labels arrays
    const labelsEqual = JSON.stringify(editedLabels.sort()) === JSON.stringify((tarefa?.labels || []).sort());
    if (!labelsEqual) input.labels = editedLabels;
    
    if (Object.keys(input).length > 0) {
      await updateTarefa.mutateAsync({ tarefaId, input });
    }
    setIsEditing(false);
  };

  const handleAddComment = async () => {
    if (!tarefaId || !newComment.trim()) return;
    
    await createComment.mutateAsync({
      tarefaId,
      input: { content: newComment },
    });
    setNewComment('');
  };

  const handleStartEdit = () => {
    setEditedTitle(tarefa?.title || '');
    setEditedDescription(tarefa?.description || '');
    setEditedPriority((tarefa?.priority || 'MEDIUM') as any);
    setEditedAssigneeId(tarefa?.assignee_id || 'none');
    setEditedEpicId(tarefa?.epic_id || 'none');
    setEditedDueDate(tarefa?.due_date || '');
    setEditedEstimatedHours(tarefa?.estimated_hours != null ? String(tarefa.estimated_hours) : '');
    // Include type as a label if it exists
    const labels = tarefa?.labels || [];
    const typeAsLabel = tarefa?.type && !labels.includes(tarefa.type) ? [tarefa.type, ...labels] : labels;
    setEditedLabels(typeAsLabel);
    setNewLabelInput('');
    setIsEditing(true);
  };

  const handleAddLabel = () => {
    if (newLabelInput.trim() && !editedLabels.includes(newLabelInput.trim())) {
      setEditedLabels([...editedLabels, newLabelInput.trim()]);
      setNewLabelInput('');
    }
  };

  const handleRemoveLabel = (label: string) => {
    setEditedLabels(editedLabels.filter(l => l !== label));
  };

  if (!tarefaId) return null;

  const priorityConfig = tarefa ? PRIORITY_CONFIG[tarefa.priority] : null;
  const typeConfig = tarefa ? TYPE_CONFIG[tarefa.type] : null;

  return (
    <Dialog open={!!tarefaId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        {tarefaLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : tarefa ? (
          <>
            {/* Header */}
            <DialogHeader className="p-6 pb-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                {typeConfig && <typeConfig.icon className="h-4 w-4" style={{ color: typeConfig.color }} />}
                <span className="font-mono font-medium">{tarefa.key}</span>
                <Badge variant="outline" className="flex items-center gap-1.5" style={{ borderColor: priorityConfig?.color + '40', color: priorityConfig?.color, backgroundColor: priorityConfig?.color + '10' }}>
                  {priorityConfig && <priorityConfig.icon className="h-3.5 w-3.5" />}
                  {priorityConfig?.label}
                </Badge>
                {tarefa.status && (
                  <Badge style={{ backgroundColor: tarefa.status.color }}>
                    {tarefa.status.name}
                  </Badge>
                )}
              </div>
              
              {isEditing ? (
                <Input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="text-xl font-semibold"
                />
              ) : (
                <DialogTitle className="text-xl cursor-pointer hover:text-primary" onClick={handleStartEdit}>
                  {tarefa.title}
                </DialogTitle>
              )}
              <DialogDescription>
                Clique no título/descrição para editar e use o botão "Salvar" para persistir as mudanças.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-hidden flex">
              {/* Main Content */}
              <div className="flex-1 p-6 overflow-y-auto min-w-0">
                {/* Description */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium mb-2">Descrição</h3>
                  {isEditing ? (
                    <Textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      rows={5}
                      placeholder="Adicione uma descrição..."
                    />
                  ) : (
                    <div
                      className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 p-2 rounded min-h-[60px]"
                      onClick={handleStartEdit}
                    >
                      {tarefa.description || 'Clique para adicionar uma descrição...'}
                    </div>
                  )}
                </div>

                {/* Whiteboard Origin */}
                {tarefa.whiteboard_origin && (
                  <div className="mb-6 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <Layout className="h-4 w-4" />
                      <span className="font-medium">Origem: Quadro Branco</span>
                      <Button variant="link" size="sm" className="ml-auto">
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Ver no Quadro
                      </Button>
                    </div>
                  </div>
                )}

                {/* Código (GitHub) */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Code2 className="h-4 w-4" />
                    Código (GitHub)
                  </h3>
                  {gitLinksLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : gitLinksData?.links && gitLinksData.links.length > 0 ? (
                    <div className="space-y-2">
                      {gitLinksData.links.map((link) => (
                        <div
                          key={link.id}
                          className="p-3 bg-muted/50 rounded-lg border border-border hover:bg-muted transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {link.repo && (
                                <div className="text-sm font-medium mb-1 truncate">
                                  {link.repo.fullName}
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {link.branch && (
                                  <div className="flex items-center gap-1">
                                    <GitBranch className="h-3 w-3" />
                                    <span className="font-mono">{link.branch}</span>
                                  </div>
                                )}
                                {link.commitSha && (
                                  <div className="flex items-center gap-1">
                                    <GitCommit className="h-3 w-3" />
                                    <span className="font-mono">{link.commitSha.substring(0, 7)}</span>
                                  </div>
                                )}
                                {link.pr && (
                                  <div className="flex items-center gap-1">
                                    <GitPullRequest className="h-3 w-3" />
                                    <span>PR #{link.pr.number}</span>
                                    <Badge
                                      variant={
                                        link.pr.state === 'MERGED'
                                          ? 'default'
                                          : link.pr.state === 'CLOSED'
                                          ? 'secondary'
                                          : 'outline'
                                      }
                                      className="text-xs"
                                    >
                                      {link.pr.state}
                                    </Badge>
                                  </div>
                                )}
                                {link.autoLinked && (
                                  <Badge variant="outline" className="text-xs">
                                    Auto-link
                                  </Badge>
                                )}
                              </div>
                              {link.pr && (
                                <div className="text-xs text-muted-foreground mt-1 truncate">
                                  {link.pr.title}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {link.pr && tarefa?.project_id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    navigate(`/project/${tarefa.project_id}/code/repos/${link.repo?.id}/pull-requests/${link.pr?.number}`);
                                    onClose();
                                  }}
                                  title="Abrir no módulo Código"
                                >
                                  <Code2 className="h-4 w-4" />
                                </Button>
                              )}
                              {link.url && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => window.open(link.url!, '_blank')}
                                  title="Abrir no GitHub"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                          {link.pr && (
                            <div className="mt-2 pt-2 border-t border-border">
                              <div className="text-xs text-muted-foreground">
                                {link.pr.state === 'OPEN' && 'PR aberto'}
                                {link.pr.state === 'MERGED' && 'PR mergeado'}
                                {link.pr.state === 'CLOSED' && 'PR fechado'}
                                {link.pr.state === 'MERGED' && ' - Tarefa será atualizada automaticamente'}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                      Nenhum vínculo com código encontrado.
                      <br />
                      <span className="text-xs">
                        Crie branches, commits ou PRs com <code className="px-1 py-0.5 bg-muted rounded">TSK-{tarefa.key.split('-')[1]}</code> no nome para auto-link.
                      </span>
                    </div>
                  )}
                </div>

                {/* Tabs for Comments and Activity */}
                <Tabs defaultValue="comments">
                  <TabsList>
                    <TabsTrigger value="comments" className="gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Comentários
                    </TabsTrigger>
                    <TabsTrigger value="activity" className="gap-2">
                      <History className="h-4 w-4" />
                      Histórico
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="comments" className="mt-4">
                    {/* Add Comment */}
                    <div className="flex gap-2 mb-4">
                      <Textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Adicione um comentário..."
                        rows={2}
                        className="flex-1"
                      />
                      <Button
                        size="icon"
                        onClick={handleAddComment}
                        disabled={!newComment.trim() || createComment.isPending}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Comments List */}
                    <div className="space-y-4">
                      {commentsLoading ? (
                        <Skeleton className="h-20 w-full" />
                      ) : comments?.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhum comentário ainda
                        </p>
                      ) : (
                        comments?.map(comment => (
                          <div key={comment.id} className="flex gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={comment.author?.avatar_url} />
                              <AvatarFallback>
                                {comment.author?.full_name?.charAt(0) || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium">
                                  {comment.author?.full_name || 'Usuário'}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(comment.created_at), {
                                    addSuffix: true,
                                    locale: ptBR,
                                  })}
                                </span>
                              </div>
                              <p className="text-sm">{comment.content}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="activity" className="mt-4">
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-3">
                        {activityLoading ? (
                          <Skeleton className="h-16 w-full" />
                        ) : activity?.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Nenhuma atividade registrada
                          </p>
                        ) : (
                          activity?.map(log => (
                            <div key={log.id} className="flex gap-3 text-sm">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={log.user?.avatar_url} />
                                <AvatarFallback className="text-xs">
                                  {log.user?.full_name?.charAt(0) || '?'}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <span className="font-medium">
                                  {log.user?.full_name || 'Usuário'}
                                </span>
                                {' '}
                                <span className="text-muted-foreground">
                                  {log.action === 'created' && 'criou esta tarefa'}
                                  {log.action === 'updated' && `alterou ${log.field_name}`}
                                  {log.action === 'transitioned' && `moveu para ${log.new_value}`}
                                  {log.action === 'commented' && 'adicionou um comentário'}
                                </span>
                                {log.action === 'updated' && log.old_value && (
                                  <span className="text-muted-foreground">
                                    {' '}de "{log.old_value}" para "{log.new_value}"
                                  </span>
                                )}
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {formatDistanceToNow(new Date(log.created_at), {
                                    addSuffix: true,
                                    locale: ptBR,
                                  })}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Sidebar */}
              <div className="w-64 border-l border-border bg-muted/30 flex flex-col overflow-hidden">
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-4">
                {!isEditing && (
                  <div className="mb-4">
                    <Button size="sm" variant="outline" className="w-full" onClick={handleStartEdit}>
                      <Pencil className="h-3 w-3 mr-2" />
                      Editar Tarefa
                    </Button>
                  </div>
                )}
                
                {isEditing && (
                  <div className="mb-4 flex gap-2">
                    <Button size="sm" className="flex-1" onClick={handleSave} disabled={updateTarefa.isPending}>
                      Salvar
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setIsEditing(false)}>
                      Cancelar
                    </Button>
                  </div>
                )}
                
                {/* Assignee */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <User className="h-3 w-3" /> Responsável
                  </h4>
                  {isEditing ? (
                    <Select value={editedAssigneeId || 'none'} onValueChange={setEditedAssigneeId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Não atribuído</SelectItem>
                        {(members || []).map((m) => (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {m.profiles?.full_name || m.user_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : tarefa.assignee?.full_name ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={tarefa.assignee.avatar_url} />
                        <AvatarFallback>{tarefa.assignee.full_name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{tarefa.assignee.full_name}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Não atribuído</span>
                  )}
                </div>

                <Separator />

                {/* Epic */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Zap className="h-3 w-3" /> Épico
                  </h4>
                  {isEditing ? (
                    <Select value={editedEpicId || 'none'} onValueChange={setEditedEpicId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum épico</SelectItem>
                        {(epics || []).map((epic) => (
                          <SelectItem key={epic.id} value={epic.id}>
                            {epic.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : tarefa.epic_id ? (
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-purple-500" />
                      <span className="text-sm">{epics?.find(e => e.id === tarefa.epic_id)?.title || 'Épico'}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Nenhum épico</span>
                  )}
                </div>

                <Separator />

                {/* Reporter */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Relator</h4>
                  {tarefa.reporter ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={tarefa.reporter.avatar_url} />
                        <AvatarFallback>{tarefa.reporter.full_name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{tarefa.reporter.full_name}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </div>

                <Separator />

                {/* Due Date */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Data de Entrega
                  </h4>
                  {isEditing ? (
                    <Input
                      type="date"
                      value={editedDueDate}
                      onChange={(e) => setEditedDueDate(e.target.value)}
                      className="h-9"
                    />
                  ) : (
                    <span className="text-sm">
                      {tarefa.due_date
                        ? format(new Date(tarefa.due_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                        : 'Não definida'}
                    </span>
                  )}
                </div>

                <Separator />

                {/* Labels (includes type) */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Tipo e Etiquetas
                  </h4>
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {editedLabels.map(label => {
                          const isType = ['EPIC', 'STORY', 'TASK', 'SUBTASK', 'BUG'].includes(label.toUpperCase());
                          const typeConfig = isType ? TYPE_CONFIG[label.toUpperCase() as TarefaType] : null;
                          return (
                            <Badge 
                              key={label} 
                              variant={isType ? "default" : "secondary"} 
                              className="text-xs flex items-center gap-1"
                              style={isType && typeConfig ? { 
                                backgroundColor: typeConfig.color,
                                color: 'white',
                                borderColor: typeConfig.color
                              } : {}}
                            >
                              {isType && typeConfig && <typeConfig.icon className="h-3 w-3" />}
                              {label}
                              <button
                                type="button"
                                onClick={() => handleRemoveLabel(label)}
                                className="ml-1 hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                      <div className="space-y-1">
                        <div className="flex gap-1">
                          <Input
                            value={newLabelInput}
                            onChange={(e) => setNewLabelInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddLabel();
                              }
                            }}
                            placeholder="Adicionar etiqueta ou tipo..."
                            className="h-8 text-xs"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleAddLabel}
                            className="h-8"
                          >
                            <Tag className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Object.keys(TYPE_CONFIG).map((type) => {
                            const typeKey = type as TarefaType;
                            const config = TYPE_CONFIG[typeKey];
                            const isSelected = editedLabels.includes(type);
                            const Icon = config.icon;
                            return (
                              <Button
                                key={type}
                                type="button"
                                size="sm"
                                variant={isSelected ? "default" : "outline"}
                                className="h-7 text-xs gap-1.5"
                                style={isSelected ? { backgroundColor: config.color, color: 'white' } : {}}
                                onClick={() => {
                                  if (isSelected) {
                                    handleRemoveLabel(type);
                                  } else {
                                    // Remove other types first
                                    const otherTypes = ['EPIC', 'STORY', 'TASK', 'SUBTASK', 'BUG'];
                                    const filtered = editedLabels.filter(l => !otherTypes.includes(l.toUpperCase()));
                                    setEditedLabels([...filtered, type]);
                                  }
                                }}
                              >
                                <Icon className="h-3 w-3" /> {config.label}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground mb-2">
                        Use etiquetas para categorizar tarefas. Tipos (EPIC, STORY, TASK, SUBTASK, BUG) também são etiquetas.
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {tarefa.type && (
                          <Badge 
                            variant="default" 
                            className="text-xs flex items-center gap-1.5"
                            style={{ 
                              backgroundColor: typeConfig?.color,
                              color: 'white',
                              borderColor: typeConfig?.color
                            }}
                          >
                            {typeConfig && <typeConfig.icon className="h-3.5 w-3.5" />}
                            {typeConfig?.label}
                          </Badge>
                        )}
                        {tarefa.labels?.filter(l => !['EPIC', 'STORY', 'TASK', 'SUBTASK', 'BUG'].includes(l.toUpperCase())).map(label => (
                          <Badge key={label} variant="secondary" className="text-xs">
                            {label}
                          </Badge>
                        ))}
                      </div>
                      {(!tarefa.labels || tarefa.labels.length === 0) && !tarefa.type && (
                        <span className="text-sm text-muted-foreground">Nenhuma etiqueta</span>
                      )}
                    </>
                  )}
                </div>

                <Separator />

                {/* Estimated Hours */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Estimativa
                  </h4>
                  {isEditing ? (
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      value={editedEstimatedHours}
                      onChange={(e) => setEditedEstimatedHours(e.target.value)}
                      className="h-9"
                      placeholder="Ex: 2"
                    />
                  ) : (
                    <span className="text-sm">
                      {tarefa.estimated_hours != null ? `${tarefa.estimated_hours}h` : 'Não estimada'}
                    </span>
                  )}
                </div>

                <Separator />

                {/* Priority */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Prioridade</h4>
                  {isEditing ? (
                    <Select value={String(editedPriority)} onValueChange={(v) => setEditedPriority(v as any)}>
                      <SelectTrigger className="h-9 flex items-center gap-2">
                        {editedPriority && (() => {
                          const config = PRIORITY_CONFIG[editedPriority];
                          const Icon = config.icon;
                          return (
                            <>
                              <Icon className="h-4 w-4 flex-shrink-0" style={{ color: config.color }} />
                              <SelectValue>{config.label}</SelectValue>
                            </>
                          );
                        })()}
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(PRIORITY_CONFIG).map((k) => {
                          const config = PRIORITY_CONFIG[k as any];
                          return (
                            <SelectItem key={k} value={k}>
                              {config.label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2">
                      {priorityConfig && (
                        <>
                          <priorityConfig.icon className="h-4 w-4" style={{ color: priorityConfig.color }} />
                          <span className="text-sm">{priorityConfig.label}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>


                <Separator />

                {/* Created/Updated */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Criada: {format(new Date(tarefa.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</div>
                  <div>Atualizada: {format(new Date(tarefa.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</div>
                </div>
                  </div>
                </ScrollArea>
              </div>
            </div>
          </>
        ) : (
          <div className="p-6 text-center text-muted-foreground">
            Tarefa não encontrada
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
