import { useState } from 'react';
import { useCreateTarefa } from '@/hooks/useTarefas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Zap, ChevronRight, Info } from 'lucide-react';
import type { Tarefa } from '@/types/tarefas';

interface EpicPanelProps {
  projectId: string;
  epics: Tarefa[];
  selectedEpicId: string | null;
  onSelectEpic: (epicId: string | null) => void;
  tarefas?: Tarefa[];
}

export function EpicPanel({ projectId, epics, selectedEpicId, onSelectEpic, tarefas = [] }: EpicPanelProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [epicName, setEpicName] = useState('');
  const createTarefa = useCreateTarefa();

  const handleCreateEpic = async () => {
    if (!epicName.trim()) return;
    
    await createTarefa.mutateAsync({
      project_id: projectId,
      title: epicName.trim(),
      type: 'EPIC',
    });
    
    setEpicName('');
    setIsDialogOpen(false);
  };

  return (
    <div className="w-64 border-r border-border flex flex-col bg-muted/30">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-500" />
            Épicos
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="font-medium mb-1">O que são Épicos?</p>
                <p className="text-xs">
                  Épicos são grandes iniciativas que agrupam múltiplas tarefas relacionadas. 
                  Use épicos para organizar trabalho em torno de objetivos maiores, como 
                  "Melhorar Performance" ou "Nova Funcionalidade X". Tarefas podem ser 
                  atribuídas a um épico para facilitar o rastreamento e planejamento.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Épico</DialogTitle>
              <DialogDescription>
                Crie um novo épico para agrupar tarefas relacionadas.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Input
                placeholder="Nome do épico"
                value={epicName}
                onChange={(e) => setEpicName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateEpic()}
              />
              <Button onClick={handleCreateEpic} disabled={createTarefa.isPending}>
                Criar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* All Items option */}
          <button
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
              selectedEpicId === null 
                ? 'bg-primary/10 text-primary' 
                : 'hover:bg-muted text-muted-foreground'
            }`}
            onClick={() => onSelectEpic(null)}
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${selectedEpicId === null ? 'rotate-90' : ''}`} />
            <span>Todos os itens</span>
          </button>

          {/* Epic list */}
          {epics.map(epic => {
            const tarefasCount = tarefas.filter(t => t.epic_id === epic.id).length;
            return (
              <button
                key={epic.id}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                  selectedEpicId === epic.id 
                    ? 'bg-primary/10 text-primary' 
                    : 'hover:bg-muted'
                }`}
                onClick={() => onSelectEpic(epic.id)}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Zap className="h-4 w-4 text-purple-500 flex-shrink-0" />
                  <span className="truncate">{epic.title}</span>
                </div>
                {tarefasCount > 0 && (
                  <Badge variant="secondary" className="text-xs flex-shrink-0">
                    {tarefasCount}
                  </Badge>
                )}
              </button>
            );
          })}

          {epics.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              Nenhum épico criado
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
