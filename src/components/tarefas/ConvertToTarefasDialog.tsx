import { useState } from 'react';
import { useBoards } from '@/hooks/useTarefas';
import { useEpics, useBacklog } from '@/hooks/useBacklog';
import { useConvertToTarefas } from '@/hooks/useConvertToTarefas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckSquare, Plus, Trash2 } from 'lucide-react';
import type { TarefaType, TarefaPriority } from '@/types/tarefas';

interface ConvertItem {
  nodeId: string;
  title: string;
  description?: string;
  type: TarefaType;
  priority: TarefaPriority;
  selected: boolean;
}

interface ConvertToTarefasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  whiteboardId: string;
  selectedNodes: Array<{
    id: string;
    type: string;
    text?: string;
  }>;
  areaBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export function ConvertToTarefasDialog({
  open,
  onOpenChange,
  projectId,
  whiteboardId,
  selectedNodes,
  areaBounds,
}: ConvertToTarefasDialogProps) {
  const { data: boards } = useBoards(projectId);
  const { data: epics } = useEpics(projectId);
  const { data: backlogData } = useBacklog(projectId);
  const convertToTarefas = useConvertToTarefas();

  const [selectedBoardId, setSelectedBoardId] = useState<string | undefined>();
  const [selectedEpicId, setSelectedEpicId] = useState<string | undefined>();
  const [selectedSprintId, setSelectedSprintId] = useState<string | undefined>();

  // Initialize items from selected nodes
  const [items, setItems] = useState<ConvertItem[]>(() =>
    selectedNodes.map(node => ({
      nodeId: node.id,
      title: node.text || `Tarefa de ${node.type}`,
      description: '',
      type: 'TASK' as TarefaType,
      priority: 'MEDIUM' as TarefaPriority,
      selected: true,
    }))
  );

  const updateItem = (index: number, updates: Partial<ConvertItem>) => {
    setItems(prev => prev.map((item, i) => 
      i === index ? { ...item, ...updates } : item
    ));
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const addItem = () => {
    setItems(prev => [...prev, {
      nodeId: `manual-${Date.now()}`,
      title: 'Nova tarefa',
      description: '',
      type: 'TASK' as TarefaType,
      priority: 'MEDIUM' as TarefaPriority,
      selected: true,
    }]);
  };

  const handleSubmit = async () => {
    const selectedItems = items.filter(item => item.selected);
    if (selectedItems.length === 0) return;

    await convertToTarefas.mutateAsync({
      projectId,
      boardId: selectedBoardId,
      epicId: selectedEpicId,
      sprintId: selectedSprintId,
      whiteboardId,
      items: selectedItems.map(item => ({
        nodeId: item.nodeId,
        title: item.title,
        description: item.description,
        type: item.type,
        priority: item.priority,
      })),
      areaBounds,
    });

    onOpenChange(false);
  };

  const activeSprints = backlogData?.sprints.filter(s => s.state !== 'DONE') || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Converter para Tarefas
          </DialogTitle>
          <DialogDescription>
            Crie tarefas a partir dos elementos selecionados no Quadro Branco
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Destination options */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Board</Label>
              <Select value={selectedBoardId} onValueChange={setSelectedBoardId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum (só backlog)</SelectItem>
                  {boards?.map(board => (
                    <SelectItem key={board.id} value={board.id}>
                      {board.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Épico</Label>
              <Select value={selectedEpicId} onValueChange={setSelectedEpicId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {epics?.map(epic => (
                    <SelectItem key={epic.id} value={epic.id}>
                      {epic.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Sprint</Label>
              <Select value={selectedSprintId} onValueChange={setSelectedSprintId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (backlog)</SelectItem>
                  {activeSprints.map(sprint => (
                    <SelectItem key={sprint.id} value={sprint.id}>
                      {sprint.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Items list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Tarefas a criar</Label>
              <Button variant="ghost" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" />
                Adicionar
              </Button>
            </div>

            <ScrollArea className="h-[300px] border rounded-lg p-2">
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div
                    key={item.nodeId}
                    className={`p-3 border rounded-lg space-y-3 ${
                      item.selected ? 'border-primary/50 bg-primary/5' : 'border-border opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={item.selected}
                        onCheckedChange={(checked) => updateItem(index, { selected: !!checked })}
                      />
                      <div className="flex-1 space-y-2">
                        <Input
                          value={item.title}
                          onChange={(e) => updateItem(index, { title: e.target.value })}
                          placeholder="Título da tarefa"
                          disabled={!item.selected}
                        />
                        <Textarea
                          value={item.description}
                          onChange={(e) => updateItem(index, { description: e.target.value })}
                          placeholder="Descrição (opcional)"
                          rows={2}
                          disabled={!item.selected}
                        />
                        <div className="flex gap-2">
                          <Select
                            value={item.type}
                            onValueChange={(v) => updateItem(index, { type: v as TarefaType })}
                            disabled={!item.selected}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="TASK">Task</SelectItem>
                              <SelectItem value="BUG">Bug</SelectItem>
                              <SelectItem value="STORY">Story</SelectItem>
                              <SelectItem value="SUBTASK">Subtask</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select
                            value={item.priority}
                            onValueChange={(v) => updateItem(index, { priority: v as TarefaPriority })}
                            disabled={!item.selected}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="HIGHEST">Highest</SelectItem>
                              <SelectItem value="HIGH">High</SelectItem>
                              <SelectItem value="MEDIUM">Medium</SelectItem>
                              <SelectItem value="LOW">Low</SelectItem>
                              <SelectItem value="LOWEST">Lowest</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {items.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum item para converter
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={items.filter(i => i.selected).length === 0 || convertToTarefas.isPending}
          >
            {convertToTarefas.isPending
              ? 'Criando...'
              : `Criar ${items.filter(i => i.selected).length} tarefa(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
