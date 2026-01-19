import { useState, useEffect } from 'react';
import { useBoards, useCreateBoard, useUpdateBoard, useDeleteBoard } from '@/hooks/useTarefas';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Layout, Star, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
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
  const updateBoard = useUpdateBoard();
  const deleteBoard = useDeleteBoard();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editName, setEditName] = useState(board.name);
  const [editDescription, setEditDescription] = useState(board.description || '');
  const [editType, setEditType] = useState<BoardType>(board.type);

  // Update form state when board changes
  useEffect(() => {
    setEditName(board.name);
    setEditDescription(board.description || '');
    setEditType(board.type);
  }, [board]);

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;

    try {
      await updateBoard.mutateAsync({
        boardId: board.id,
        input: {
          name: editName.trim(),
          description: editDescription.trim() || undefined,
          type: editType,
        },
      });
      setShowEditDialog(false);
    } catch (error) {
      // Error is handled by the hook
    }
  };

  const handleDelete = async () => {
    try {
      await deleteBoard.mutateAsync({
        boardId: board.id,
        projectId: board.project_id,
      });
      setShowDeleteDialog(false);
    } catch (error) {
      // Error is handled by the hook
    }
  };

  return (
    <>
      <Card
        className="cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all group"
        onClick={onClick}
      >
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-medium">{board.name}</CardTitle>
          <div className="flex items-center gap-1">
            {board.is_favorite && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditName(board.name);
                    setEditDescription(board.description || '');
                    setEditType(board.type);
                    setShowEditDialog(true);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <form onSubmit={handleEdit}>
            <DialogHeader>
              <DialogTitle>Editar Board</DialogTitle>
              <DialogDescription>
                Atualize as informações do board.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-board-name">Nome *</Label>
                <Input
                  id="edit-board-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ex: Sprint 1, Backlog, etc."
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-board-description">Descrição</Label>
                <Textarea
                  id="edit-board-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Descrição opcional..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-board-type">Tipo</Label>
                <Select value={editType} onValueChange={(v) => setEditType(v as BoardType)}>
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
              <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!editName.trim() || updateBoard.isPending}>
                {updateBoard.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Board</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o board "{board.name}"? Esta ação não pode ser desfeita.
              Todas as tarefas, épicos e sprints relacionados a este board serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBoard.isPending}
            >
              {deleteBoard.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
