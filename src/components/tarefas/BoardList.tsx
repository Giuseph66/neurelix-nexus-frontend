import { useState } from 'react';
import { useBoards, useCreateBoard } from '@/hooks/useTarefas';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Layout, Star, MoreHorizontal } from 'lucide-react';
import type { Board, BoardType } from '@/types/tarefas';

interface BoardListProps {
  projectId: string;
  onSelectBoard: (boardId: string) => void;
}

export function BoardList({ projectId, onSelectBoard }: BoardListProps) {
  const { data: boards, isLoading } = useBoards(projectId);
  const createBoard = useCreateBoard();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardDescription, setNewBoardDescription] = useState('');
  const [newBoardType, setNewBoardType] = useState<BoardType>('KANBAN');

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;

    const board = await createBoard.mutateAsync({
      project_id: projectId,
      name: newBoardName.trim(),
      description: newBoardDescription.trim() || undefined,
      type: newBoardType,
    });

    setNewBoardName('');
    setNewBoardDescription('');
    setNewBoardType('KANBAN');
    setShowCreateDialog(false);
    onSelectBoard(board.id);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Boards</h2>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Board
        </Button>
      </div>

      {boards?.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 rounded-full bg-primary/10">
              <Layout className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-medium mb-1">Nenhum board ainda</h3>
              <p className="text-muted-foreground text-sm">
                Crie seu primeiro board para começar a organizar suas tarefas.
              </p>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Board
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards?.map(board => (
            <BoardCard key={board.id} board={board} onClick={() => onSelectBoard(board.id)} />
          ))}
        </div>
      )}

      {/* Create Board Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <form onSubmit={handleCreateBoard}>
            <DialogHeader>
              <DialogTitle>Criar Novo Board</DialogTitle>
              <DialogDescription>
                Crie um novo board para organizar suas tarefas em diferentes workflows.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="board-name">Nome *</Label>
                <Input
                  id="board-name"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  placeholder="Ex: Sprint 1, Backlog, etc."
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="board-description">Descrição</Label>
                <Textarea
                  id="board-description"
                  value={newBoardDescription}
                  onChange={(e) => setNewBoardDescription(e.target.value)}
                  placeholder="Descrição opcional..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="board-type">Tipo</Label>
                <Select value={newBoardType} onValueChange={(v) => setNewBoardType(v as BoardType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KANBAN">Kanban</SelectItem>
                    <SelectItem value="SCRUM">Scrum</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!newBoardName.trim() || createBoard.isPending}>
                {createBoard.isPending ? 'Criando...' : 'Criar Board'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BoardCard({ board, onClick }: { board: Board; onClick: () => void }) {
  return (
    <Card
      className="cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all"
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">{board.name}</CardTitle>
        <div className="flex items-center gap-1">
          {board.is_favorite && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Layout className="h-4 w-4" />
          <span>{board.type}</span>
        </div>
        {board.description && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {board.description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
