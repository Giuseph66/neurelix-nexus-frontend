import { useState } from 'react';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useStartSprint, useCompleteSprint } from '@/hooks/useBacklog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { EditSprintDialog } from './EditSprintDialog';
import { ChevronDown, ChevronRight, Play, CheckCircle, GripVertical, Pencil } from 'lucide-react';
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

function SprintDroppable({ sprintId, children }: { sprintId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `sprint:${sprintId}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={`${isOver ? 'ring-2 ring-primary ring-offset-2 rounded-lg' : ''}`}
    >
      {children}
    </div>
  );
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

  const TypeIcon = typeConfig.icon;
  const PriorityIcon = priorityConfig.icon;

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

      <div className="flex items-center gap-2">
        <PriorityIcon 
          className="h-4 w-4" 
          style={{ color: priorityConfig.color }} 
          title={`Prioridade: ${priorityConfig.label}`}
        />
        <Badge 
          variant="outline" 
          className="text-[10px] h-5 px-1.5"
          style={{ borderColor: priorityConfig.color + '40', color: priorityConfig.color }}
        >
          {priorityConfig.label}
        </Badge>
      </div>
    </div>
  );
}

export function SprintSection({ sprint, tarefas, projectId, onTarefaClick }: SprintSectionProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [showEditDialog, setShowEditDialog] = useState(false);
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

  const handleEditSprint = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowEditDialog(true);
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
              <Button
                size="sm"
                variant="ghost"
                onClick={handleEditSprint}
              >
                <Pencil className="h-3 w-3" />
              </Button>
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
          <SprintDroppable sprintId={sprint.id}>
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
                <div className="text-center py-4 text-muted-foreground text-sm border-2 border-dashed border-border rounded-lg">
                  Arraste tarefas do backlog para esta sprint
                </div>
              )}
            </div>
          </SprintDroppable>
        </CollapsibleContent>
      </div>
      
      <EditSprintDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        sprint={sprint}
        projectId={projectId}
      />
    </Collapsible>
  );
}
