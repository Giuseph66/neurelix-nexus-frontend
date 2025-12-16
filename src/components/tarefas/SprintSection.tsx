import { useState } from 'react';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStartSprint, useCompleteSprint } from '@/hooks/useBacklog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Play, CheckCircle, GripVertical, Bug, Zap, CheckSquare, BookOpen, Circle } from 'lucide-react';
import type { Tarefa, Sprint } from '@/types/tarefas';
import { PRIORITY_CONFIG, TYPE_CONFIG } from '@/types/tarefas';

interface SprintSectionProps {
  sprint: Sprint;
  tarefas: Tarefa[];
  projectId: string;
  onTarefaClick: (tarefaId: string) => void;
}

interface SprintItemProps {
  tarefa: Tarefa;
  onClick: () => void;
}

function SprintItem({ tarefa, onClick }: SprintItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tarefa.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const typeConfig = TYPE_CONFIG[tarefa.type];
  const priorityConfig = PRIORITY_CONFIG[tarefa.priority];

  const TypeIcon = tarefa.type === 'BUG' ? Bug : 
                   tarefa.type === 'EPIC' ? Zap :
                   tarefa.type === 'STORY' ? BookOpen :
                   tarefa.type === 'SUBTASK' ? Circle :
                   CheckSquare;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-card border border-border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer ${
        isDragging ? 'opacity-50 shadow-lg' : ''
      }`}
      onClick={onClick}
    >
      <button
        className="cursor-grab hover:bg-muted rounded p-1"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      <div className="flex items-center gap-2">
        <TypeIcon 
          className="h-4 w-4 flex-shrink-0" 
          style={{ color: typeConfig.color }}
        />
        <span className="text-sm font-mono text-muted-foreground">{tarefa.key}</span>
      </div>

      <span className="flex-1 text-sm font-medium truncate">{tarefa.title}</span>

      <Badge 
        variant="outline" 
        className="text-xs"
        style={{ borderColor: priorityConfig.color, color: priorityConfig.color }}
      >
        {priorityConfig.label}
      </Badge>
    </div>
  );
}

export function SprintSection({ sprint, tarefas, projectId, onTarefaClick }: SprintSectionProps) {
  const [isOpen, setIsOpen] = useState(true);
  const startSprint = useStartSprint();
  const completeSprint = useCompleteSprint();

  const isActive = sprint.state === 'ACTIVE';
  const isPlanned = sprint.state === 'PLANNED';

  const handleStartSprint = (e: React.MouseEvent) => {
    e.stopPropagation();
    startSprint.mutate({ sprintId: sprint.id, projectId });
  };

  const handleCompleteSprint = (e: React.MouseEvent) => {
    e.stopPropagation();
    completeSprint.mutate({ sprintId: sprint.id, projectId });
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={`border rounded-lg ${isActive ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors">
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}

            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{sprint.name}</span>
                <Badge variant={isActive ? 'default' : 'secondary'} className="text-xs">
                  {isActive ? 'Ativa' : isPlanned ? 'Planejada' : 'Concluída'}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  ({tarefas.length} itens)
                </span>
              </div>
              {sprint.goal && (
                <p className="text-sm text-muted-foreground mt-1">{sprint.goal}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isPlanned && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleStartSprint}
                  disabled={startSprint.isPending}
                >
                  <Play className="h-3 w-3 mr-1" />
                  Iniciar
                </Button>
              )}
              {isActive && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCompleteSprint}
                  disabled={completeSprint.isPending}
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Finalizar
                </Button>
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-3 pt-0 space-y-2">
            <SortableContext
              items={tarefas.map(t => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {tarefas.map(tarefa => (
                <SprintItem
                  key={tarefa.id}
                  tarefa={tarefa}
                  onClick={() => onTarefaClick(tarefa.id)}
                />
              ))}
            </SortableContext>

            {tarefas.length === 0 && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                Arraste tarefas do backlog para esta sprint
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
