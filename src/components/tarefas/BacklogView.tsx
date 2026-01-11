import { useState, useCallback } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBacklog, useReorderBacklog, useAssignToEpic, useAssignToSprint } from '@/hooks/useBacklog';
import { TarefaDetailModal } from './TarefaDetailModal';
import { CreateTarefaDialog } from './CreateTarefaDialog';
import { CreateSprintDialog } from './CreateSprintDialog';
import { EpicPanel } from './EpicPanel';
import { SprintSection } from './SprintSection';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, GripVertical, Zap, Bug, CheckSquare, BookOpen, Circle } from 'lucide-react';
import type { Tarefa } from '@/types/tarefas';
import { PRIORITY_CONFIG, TYPE_CONFIG } from '@/types/tarefas';

interface BacklogViewProps {
  projectId: string;
  boardId?: string;
}

interface BacklogItemProps {
  tarefa: Tarefa;
  onClick: () => void;
}

function BacklogDroppable({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'backlog',
  });

  return (
    <div
      ref={setNodeRef}
      className={`space-y-2 ${isOver ? 'ring-2 ring-primary ring-offset-2 rounded-lg p-2' : ''}`}
    >
      {children}
    </div>
  );
}

function BacklogItem({ tarefa, onClick, epics }: BacklogItemProps & { epics: Tarefa[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tarefa.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const typeConfig = TYPE_CONFIG[tarefa.type];
  const priorityConfig = PRIORITY_CONFIG[tarefa.priority];
  const epic = tarefa.epic_id ? epics.find(e => e.id === tarefa.epic_id) : null;

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

      {epic && (
        <Badge variant="secondary" className="text-xs flex items-center gap-1">
          <Zap className="h-3 w-3 text-purple-500" />
          <span className="max-w-[100px] truncate">{epic.title}</span>
        </Badge>
      )}

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

export function BacklogView({ projectId, boardId }: BacklogViewProps) {
  const { data, isLoading } = useBacklog(projectId);
  const reorderBacklog = useReorderBacklog();
  const assignToSprint = useAssignToSprint();
  
  const [activeTarefa, setActiveTarefa] = useState<Tarefa | null>(null);
  const [selectedTarefaId, setSelectedTarefaId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSprintDialog, setShowSprintDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEpicId, setSelectedEpicId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const tarefa = data?.tarefas.find(t => t.id === event.active.id);
    setActiveTarefa(tarefa || null);
  }, [data]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTarefa(null);

    if (!over || !data) return;

    const tarefaId = active.id as string;
    const overId = over.id as string;

    // Check if dropping on a sprint (overId starts with 'sprint:')
    if (typeof overId === 'string' && overId.startsWith('sprint:')) {
      const sprintId = overId.replace('sprint:', '');
      const tarefa = data.tarefas.find(t => t.id === tarefaId);
      
      if (tarefa && tarefa.sprint_id !== sprintId) {
        assignToSprint.mutate({
          tarefaId,
          sprintId,
          projectId,
        });
      }
      return;
    }

    // Check if dropping on backlog (overId is 'backlog')
    if (overId === 'backlog') {
      const tarefa = data.tarefas.find(t => t.id === tarefaId);
      if (tarefa && tarefa.sprint_id) {
        assignToSprint.mutate({
          tarefaId,
          sprintId: null,
          projectId,
        });
      }
      return;
    }

    // Otherwise, reorder within backlog
    if (active.id === over.id) return;

    const oldIndex = data.tarefas.findIndex(t => t.id === active.id);
    const newIndex = data.tarefas.findIndex(t => t.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Only reorder if both are in backlog (no sprint_id)
    const oldTarefa = data.tarefas[oldIndex];
    const newTarefa = data.tarefas[newIndex];
    
    if (!oldTarefa.sprint_id && !newTarefa.sprint_id) {
      const newOrder = [...data.tarefas];
      const [removed] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, removed);

      reorderBacklog.mutate({
        projectId,
        orderedIds: newOrder.map(t => t.id),
      });
    }
  }, [data, projectId, reorderBacklog, assignToSprint]);

  // Filter tarefas
  const filteredTarefas = data?.tarefas.filter(tarefa => {
    const matchesSearch = !searchQuery || 
      tarefa.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tarefa.key.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesEpic = !selectedEpicId || tarefa.epic_id === selectedEpicId;
    return matchesSearch && matchesEpic;
  }) || [];

  // Group by sprint
  const backlogTarefas = filteredTarefas.filter(t => !t.sprint_id);
  const activeSprint = data?.sprints.find(s => s.state === 'ACTIVE');
  const plannedSprints = data?.sprints.filter(s => s.state === 'PLANNED') || [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Epic Panel */}
      <EpicPanel
        projectId={projectId}
        epics={data?.epics || []}
        selectedEpicId={selectedEpicId}
        onSelectEpic={setSelectedEpicId}
        tarefas={data?.tarefas || []}
      />

      {/* Main Backlog Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-4 p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Backlog</h2>
          
          <div className="flex-1" />
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar tarefas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          
          <Button variant="outline" onClick={() => setShowSprintDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Sprint
          </Button>
          
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Criar Tarefa
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-6">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {/* Active Sprint */}
            {activeSprint && (
              <SprintSection
                sprint={activeSprint}
                tarefas={filteredTarefas.filter(t => t.sprint_id === activeSprint.id)}
                projectId={projectId}
                onTarefaClick={setSelectedTarefaId}
              />
            )}

            {/* Planned Sprints */}
            {plannedSprints.map(sprint => (
              <SprintSection
                key={sprint.id}
                sprint={sprint}
                tarefas={filteredTarefas.filter(t => t.sprint_id === sprint.id)}
                projectId={projectId}
                onTarefaClick={setSelectedTarefaId}
              />
            ))}

            {/* Backlog (no sprint) */}
            <BacklogDroppable>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Backlog ({backlogTarefas.length} itens)
                  </h3>
                </div>

                <SortableContext
                  items={backlogTarefas.map(t => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                  {backlogTarefas.map(tarefa => (
                    <BacklogItem
                      key={tarefa.id}
                      tarefa={tarefa}
                      onClick={() => setSelectedTarefaId(tarefa.id)}
                      epics={data?.epics || []}
                    />
                  ))}
                  </div>
                </SortableContext>

                {backlogTarefas.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma tarefa no backlog
                  </div>
                )}
              </div>
            </BacklogDroppable>

            <DragOverlay>
              {activeTarefa ? (
                <div className="p-3 bg-card border border-border rounded-lg shadow-lg">
                  <span className="text-sm font-medium">{activeTarefa.title}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {/* Modals */}
      <TarefaDetailModal
        tarefaId={selectedTarefaId}
        onClose={() => setSelectedTarefaId(null)}
      />

      <CreateTarefaDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        projectId={projectId}
        boardId={boardId}
      />

      <CreateSprintDialog
        open={showSprintDialog}
        onOpenChange={setShowSprintDialog}
        projectId={projectId}
        boardId={boardId}
      />
    </div>
  );
}
