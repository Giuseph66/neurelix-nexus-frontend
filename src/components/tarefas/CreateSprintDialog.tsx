import { useState } from 'react';
import { useCreateSprint } from '@/hooks/useBacklog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface CreateSprintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  boardId?: string;
}

export function CreateSprintDialog({ open, onOpenChange, projectId, boardId }: CreateSprintDialogProps) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const createSprint = useCreateSprint();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await createSprint.mutateAsync({
      projectId,
      boardId,
      name: name.trim(),
      goal: goal.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });

    // Reset form
    setName('');
    setGoal('');
    setStartDate('');
    setEndDate('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Nova Sprint</DialogTitle>
          <DialogDescription>
            Crie uma nova sprint para organizar e planejar o trabalho da equipe.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Sprint *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sprint 1"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal">Objetivo (opcional)</Label>
              <Textarea
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="O que queremos alcançar nesta sprint?"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Data de Início</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">Data de Término</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!name.trim() || createSprint.isPending}>
              {createSprint.isPending ? 'Criando...' : 'Criar Sprint'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
