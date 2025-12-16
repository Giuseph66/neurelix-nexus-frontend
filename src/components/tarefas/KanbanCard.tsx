import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Calendar, AlertCircle } from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PRIORITY_CONFIG, TYPE_CONFIG, type Tarefa } from '@/types/tarefas';

interface KanbanCardProps {
  tarefa: Tarefa;
  onClick?: () => void;
  isDragging?: boolean;
}

export function KanbanCard({ tarefa, onClick, isDragging }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: tarefa.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priorityConfig = PRIORITY_CONFIG[tarefa.priority];
  const typeConfig = TYPE_CONFIG[tarefa.type];
  const isOverdue = tarefa.due_date && isPast(new Date(tarefa.due_date)) && !isToday(new Date(tarefa.due_date));

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "bg-card border border-border rounded-lg p-3 cursor-pointer",
        "hover:border-primary/50 hover:shadow-sm transition-all",
        (isDragging || isSortableDragging) && "opacity-50 shadow-lg rotate-2",
        isDragging && "cursor-grabbing"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{typeConfig.icon}</span>
          <span className="font-mono">{tarefa.key}</span>
        </div>
        <div className="flex items-center gap-1" title={`Prioridade: ${priorityConfig.label}`}>
          <span className="text-xs">{priorityConfig.icon}</span>
        </div>
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium mb-2 line-clamp-2">{tarefa.title}</h4>

      {/* Labels */}
      {tarefa.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tarefa.labels.slice(0, 3).map(label => (
            <Badge key={label} variant="secondary" className="text-xs px-1.5 py-0">
              {label}
            </Badge>
          ))}
          {tarefa.labels.length > 3 && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              +{tarefa.labels.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
        {/* Due date */}
        {tarefa.due_date ? (
          <div className={cn(
            "flex items-center gap-1 text-xs",
            isOverdue ? "text-destructive" : "text-muted-foreground"
          )}>
            {isOverdue && <AlertCircle className="h-3 w-3" />}
            <Calendar className="h-3 w-3" />
            <span>{format(new Date(tarefa.due_date), 'dd MMM', { locale: ptBR })}</span>
          </div>
        ) : (
          <div />
        )}

        {/* Assignee */}
        {tarefa.assignee ? (
          <Avatar className="h-6 w-6">
            <AvatarImage src={tarefa.assignee.avatar_url} />
            <AvatarFallback className="text-xs">
              {tarefa.assignee.full_name?.charAt(0) || '?'}
            </AvatarFallback>
          </Avatar>
        ) : null}
      </div>
    </div>
  );
}
