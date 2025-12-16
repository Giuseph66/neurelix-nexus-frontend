import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MoreHorizontal, Pencil, Trash2, Check, X } from 'lucide-react';
import { useUpdateWorkflowStatus, useDeleteWorkflowStatus } from '@/hooks/useTarefas';
import type { WorkflowStatus } from '@/types/tarefas';

const PRESET_COLORS = [
  '#6b7280', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4',
];

interface KanbanColumnProps {
  status: WorkflowStatus;
  tarefasCount: number;
  children: React.ReactNode;
}

export function KanbanColumn({ status, tarefasCount, children }: KanbanColumnProps) {
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
      updateStatus.mutate({ statusId: status.id, name: editName.trim(), color: editColor });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(status.name);
    setEditColor(status.color || '#6b7280');
    setIsEditing(false);
  };

  const handleDelete = () => {
    deleteStatus.mutate(status.id);
    setShowMenu(false);
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-72 flex flex-col bg-muted/30 rounded-lg",
        isOver && "ring-2 ring-primary ring-offset-2"
      )}
    >
      {/* Column Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
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
            <Popover open={showMenu} onOpenChange={setShowMenu}>
              <PopoverTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent 
                className="w-40 p-1" 
                align="end"
                onPointerDownOutside={(e) => e.stopPropagation()}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={(e) => { 
                    e.stopPropagation();
                    setIsEditing(true); 
                    setShowMenu(false); 
                  }}
                >
                  <Pencil className="h-3 w-3" />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete();
                  }}
                  disabled={status.is_initial || status.is_final}
                >
                  <Trash2 className="h-3 w-3" />
                  Excluir
                </Button>
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>

      {/* Column Content */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px]">
        {children}
      </div>
    </div>
  );
}
