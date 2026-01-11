import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
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
import { toast } from 'sonner';
import type { Sprint } from '@/types/tarefas';

interface EditSprintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sprint: Sprint | null;
  projectId: string;
}

export function EditSprintDialog({ open, onOpenChange, sprint, projectId }: EditSprintDialogProps) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (sprint) {
      setName(sprint.name || '');
      setGoal(sprint.goal || '');
      setStartDate(sprint.start_date ? sprint.start_date.split('T')[0] : '');
      setEndDate(sprint.end_date ? sprint.end_date.split('T')[0] : '');
    }
  }, [sprint, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sprint || !name.trim()) return;

    setIsLoading(true);
    try {
      await apiFetch(`/sprints/${sprint.id}`, {
        method: 'PUT',
        body: {
          name: name.trim(),
          goal: goal.trim() || null,
          start_date: startDate || null,
          end_date: endDate || null,
        },
        auth: true,
      });

      queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
      toast.success('Sprint atualizada!');
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Erro ao atualizar sprint: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!sprint) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Sprint</DialogTitle>
          <DialogDescription>
            Atualize os detalhes da sprint.
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
            <Button type="submit" disabled={!name.trim() || isLoading}>
              {isLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

