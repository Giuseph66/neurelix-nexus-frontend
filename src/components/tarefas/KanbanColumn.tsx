import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Check, X } from 'lucide-react';
import { useUpdateWorkflowStatus, useDeleteWorkflowStatus } from '@/hooks/useTarefas';
import type { WorkflowStatus } from '@/types/tarefas';

const PRESET_COLORS = [
  '#6b7280', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4',
];

interface KanbanColumnProps {
  status: WorkflowStatus;
  workflowId: string;
  tarefasCount: number;
  children: React.ReactNode;
}

export function KanbanColumn({ status, workflowId, tarefasCount, children }: KanbanColumnProps) {
  const sortableId = `col:${status.id}`;
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    data: { type: 'column', statusId: status.id },
  });

  const { setNodeRef, isOver } = useDroppable({
    id: status.id,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(status.name);
  const [editColor, setEditColor] = useState(status.color || '#6b7280');
  const [showMenu, setShowMenu] = useState(false);

  const updateStatus = useUpdateWorkflowStatus();
  const deleteStatus = useDeleteWorkflowStatus();

  const handleSave = () => {
    if (editName.trim() && (editName !== status.name || editColor !== status.color)) {
      updateStatus.mutate({ workflowId, statusId: status.id, name: editName.trim(), color: editColor });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(status.name);
    setEditColor(status.color || '#6b7280');
    setIsEditing(false);
  };

  const handleDelete = () => {
    deleteStatus.mutate({ workflowId, statusId: status.id });
    setShowMenu(false);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as const;

  return (
    <div ref={setSortableRef} style={style} className={cn(isDragging && 'opacity-60')}>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-shrink-0 w-72 flex flex-col bg-muted/30 rounded-lg",
          "max-h-[calc(100vh-12rem)] min-h-[600px]",
          isOver && "ring-2 ring-primary ring-offset-2"
        )}
      >
        {/* Column Header */}
        <div 
          className={cn(
            "flex items-center gap-2 p-3 border-b border-border flex-shrink-0",
            !isEditing && "cursor-grab active:cursor-grabbing hover:bg-muted/50 transition-colors"
          )}
          {...(!isEditing ? { ...attributes, ...listeners } : {})}
        >
          {isEditing ? (
            <div className="flex-1 space-y-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-7 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') handleCancel();
                }}
              />
              <div className="flex gap-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      "w-5 h-5 rounded-full transition-all",
                      editColor === c && "ring-2 ring-offset-1 ring-primary"
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setEditColor(c)}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={handleSave}>
                  <Check className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={handleCancel}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: status.color }}
              />
              <h3 className="font-medium text-sm flex-1 truncate">{status.name}</h3>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {tarefasCount}
              </span>
              <DropdownMenu open={showMenu} onOpenChange={setShowMenu}>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  align="end"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDownOutside={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <DropdownMenuItem
                    onClick={(e) => { 
                      e.stopPropagation();
                      setIsEditing(true); 
                      setShowMenu(false); 
                    }}
                  >
                    <Pencil className="h-3 w-3 mr-2" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete();
                    }}
                    disabled={status.is_initial || status.is_final}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-3 w-3 mr-2" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        {/* Column Content - Droppable area */}
        <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-0 relative">
          {children}
          {/* Empty space at the end to ensure drops work even when scrolled */}
          <div className="h-16 flex-shrink-0" />
        </div>
      </div>
    </div>
  );
}
