import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateTarefa } from '@/hooks/useTarefas';
import { TYPE_CONFIG, PRIORITY_CONFIG, type TarefaType, type TarefaPriority } from '@/types/tarefas';

interface CreateTarefaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  boardId?: string;
}

export function CreateTarefaDialog({
  open,
  onOpenChange,
  projectId,
  boardId,
}: CreateTarefaDialogProps) {
  const createTarefa = useCreateTarefa();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TarefaType>('TASK');
  const [priority, setPriority] = useState<TarefaPriority>('MEDIUM');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) return;

    await createTarefa.mutateAsync({
      project_id: projectId,
      board_id: boardId,
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      priority,
    });

    // Reset form
    setTitle('');
    setDescription('');
    setType('TASK');
    setPriority('MEDIUM');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Criar Nova Tarefa</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Type */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="type" className="text-right">
                Tipo
              </Label>
              <Select value={type} onValueChange={(v) => setType(v as TarefaType)}>
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(TYPE_CONFIG) as [TarefaType, typeof TYPE_CONFIG[TarefaType]][]).map(
                    ([key, config]) => (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <span>{config.icon}</span>
                          <span>{config.label}</span>
                        </span>
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="title" className="text-right">
                Título *
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="O que precisa ser feito?"
                className="col-span-3"
                required
              />
            </div>

            {/* Description */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="description" className="text-right pt-2">
                Descrição
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Adicione mais detalhes..."
                rows={3}
                className="col-span-3"
              />
            </div>

            {/* Priority */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="priority" className="text-right">
                Prioridade
              </Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TarefaPriority)}>
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(PRIORITY_CONFIG) as [TarefaPriority, typeof PRIORITY_CONFIG[TarefaPriority]][]).map(
                    ([key, config]) => (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <span>{config.icon}</span>
                          <span>{config.label}</span>
                        </span>
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!title.trim() || createTarefa.isPending}>
              {createTarefa.isPending ? 'Criando...' : 'Criar Tarefa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
