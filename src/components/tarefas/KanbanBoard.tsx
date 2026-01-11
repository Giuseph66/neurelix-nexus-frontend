import { useState, useCallback } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import { useBoardView, useMoveTarefa, useReorderWorkflowStatuses } from '@/hooks/useTarefas';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { TarefaDetailModal } from './TarefaDetailModal';
import { CreateTarefaDialog } from './CreateTarefaDialog';
import { CreateColumnDialog } from './CreateColumnDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Filter, Columns } from 'lucide-react';
import type { Tarefa } from '@/types/tarefas';

interface KanbanBoardProps {
  boardId: string;
  projectId: string;
}

export function KanbanBoard({ boardId, projectId }: KanbanBoardProps) {
  const { data: boardView, isLoading } = useBoardView(boardId);
  const moveTarefa = useMoveTarefa();
  const reorderColumns = useReorderWorkflowStatuses();
  const queryClient = useQueryClient();
  
  const [activeTarefa, setActiveTarefa] = useState<Tarefa | null>(null);
  const [selectedTarefaId, setSelectedTarefaId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCreateColumnDialog, setShowCreateColumnDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    if (typeof active.id === 'string' && active.id.startsWith('col:')) {
      setActiveTarefa(null);
      return;
    }
    const tarefa = boardView?.columns
      .flatMap(c => c.tarefas)
      .find(t => t.id === active.id);
    setActiveTarefa(tarefa || null);
  }, [boardView]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTarefa(null);

    if (!over || !boardView) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Column reordering
    if (activeId.startsWith('col:')) {
      // Check if dropping on another column or on the column's droppable area
      let targetStatusId: string | null = null;
      
      if (overId.startsWith('col:')) {
        targetStatusId = overId.replace('col:', '');
      } else {
        // Dropping on a column's droppable area (status.id)
        const targetColumn = boardView.columns.find(c => c.status.id === overId);
        if (targetColumn) {
          targetStatusId = targetColumn.status.id;
        }
      }

      if (!targetStatusId) return;

      const activeStatusId = activeId.replace('col:', '');
      if (activeStatusId === targetStatusId) return;

      const currentOrder = boardView.columns.map(c => c.status.id);
      const oldIndex = currentOrder.indexOf(activeStatusId);
      const newIndex = currentOrder.indexOf(targetStatusId);
      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = arrayMove(currentOrder, oldIndex, newIndex);

      // optimistic update
      queryClient.setQueryData(['board-view', boardId], (old: any) => {
        if (!old) return old;
        const byId = new Map(old.columns.map((c: any) => [c.status.id, c]));
        return {
          ...old,
          columns: newOrder.map((id: string) => byId.get(id)).filter(Boolean),
        };
      });

      reorderColumns.mutate({ workflowId: boardView.workflow.id, orderedStatusIds: newOrder });
      return;
    }

    // tarefa move between columns (existing behavior)
    const tarefaId = activeId;
    const targetStatusId = overId;

    // Check if dropping on a column
    const targetColumn = boardView.columns.find(c => c.status.id === targetStatusId);
    if (!targetColumn) return;

    // Get current tarefa
    const currentTarefa = boardView.columns
      .flatMap(c => c.tarefas)
      .find(t => t.id === tarefaId);
    
    if (!currentTarefa || currentTarefa.status_id === targetStatusId) return;

    // Move tarefa freely to any column (optimistic update)
    moveTarefa.mutate({ tarefaId, toStatusId: targetStatusId, boardId });
  }, [boardView, boardId, moveTarefa, queryClient, reorderColumns]);

  const handleTarefaClick = useCallback((tarefaId: string) => {
    setSelectedTarefaId(tarefaId);
  }, []);

  // Filter tarefas
  const filteredColumns = boardView?.columns.map(column => ({
    ...column,
    tarefas: column.tarefas.filter(tarefa => {
      const matchesSearch = !searchQuery || 
        tarefa.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tarefa.key.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesAssignee = !filterAssignee || tarefa.assignee_id === filterAssignee;
      return matchesSearch && matchesAssignee;
    }),
  }));

  if (isLoading) {
    return (
      <div className="flex gap-4 p-4 overflow-x-auto">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex-shrink-0 w-72">
            <Skeleton className="h-10 w-full mb-4" />
            <Skeleton className="h-24 w-full mb-2" />
            <Skeleton className="h-24 w-full mb-2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!boardView) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Board não encontrado
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-4 p-4 border-b border-border">
        <h2 className="text-lg font-semibold">{boardView.board.name}</h2>
        
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
        
        <Button variant="outline" size="icon">
          <Filter className="h-4 w-4" />
        </Button>

        <Button variant="outline" onClick={() => setShowCreateColumnDialog(true)}>
          <Columns className="h-4 w-4 mr-2" />
          Nova Coluna
        </Button>
        
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Criar Tarefa
        </Button>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={boardView.columns.map(c => `col:${c.status.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex gap-4 h-full">
              {filteredColumns?.map(column => (
                <KanbanColumn
                  key={column.status.id}
                  status={column.status}
                  workflowId={boardView.workflow.id}
                  tarefasCount={column.tarefas.length}
                >
                  <SortableContext
                    items={column.tarefas.map(t => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {column.tarefas.map(tarefa => (
                      <KanbanCard
                        key={tarefa.id}
                        tarefa={tarefa}
                        onClick={() => handleTarefaClick(tarefa.id)}
                      />
                    ))}
                  </SortableContext>
                </KanbanColumn>
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeTarefa ? (
              <KanbanCard tarefa={activeTarefa} isDragging />
            ) : null}
          </DragOverlay>
        </DndContext>
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

      <CreateColumnDialog
        open={showCreateColumnDialog}
        onOpenChange={setShowCreateColumnDialog}
        workflowId={boardView.workflow.id}
      />
    </div>
  );
}
