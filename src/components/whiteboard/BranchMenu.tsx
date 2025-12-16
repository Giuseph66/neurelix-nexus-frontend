import { useState } from "react";
import { GitBranch, GitMerge, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

interface Branch {
  id: string;
  name: string;
  branch_name: string | null;
  parent_branch_id: string | null;
}

interface BranchMenuProps {
  currentWhiteboard: Branch | null;
  branches: Branch[];
  onCreateBranch: (name: string) => Promise<void>;
  onMergeBranch: () => Promise<void>;
  onSelectBranch: (branchId: string) => void;
  loading?: boolean;
}

export function BranchMenu({
  currentWhiteboard,
  branches,
  onCreateBranch,
  onMergeBranch,
  onSelectBranch,
  loading,
}: BranchMenuProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [branchName, setBranchName] = useState("");

  const isBranch = currentWhiteboard?.parent_branch_id !== null;
  const hasChildBranches = branches.length > 0;

  const handleCreate = async () => {
    if (!branchName.trim()) return;
    await onCreateBranch(branchName.trim());
    setBranchName("");
    setShowCreateDialog(false);
  };

  const handleMerge = async () => {
    await onMergeBranch();
    setShowMergeDialog(false);
  };

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-8 w-8">
                <GitBranch className="h-4 w-4" />
                {isBranch && (
                  <Badge 
                    variant="secondary" 
                    className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
                  >
                    B
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Branches</TooltipContent>
        </Tooltip>
        
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {isBranch ? `Branch: ${currentWhiteboard?.branch_name}` : 'Quadro Principal'}
            </p>
          </div>
          
          <DropdownMenuSeparator />
          
          {!isBranch && (
            <DropdownMenuItem onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Branch
            </DropdownMenuItem>
          )}
          
          {isBranch && (
            <DropdownMenuItem onClick={() => setShowMergeDialog(true)}>
              <GitMerge className="h-4 w-4 mr-2" />
              Mesclar ao Principal
            </DropdownMenuItem>
          )}
          
          {hasChildBranches && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5">
                <p className="text-xs font-medium text-muted-foreground">Branches</p>
              </div>
              {branches.map((branch) => (
                <DropdownMenuItem 
                  key={branch.id}
                  onClick={() => onSelectBranch(branch.id)}
                >
                  <GitBranch className="h-4 w-4 mr-2" />
                  {branch.branch_name || branch.name}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Branch Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Branch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cria uma cópia do quadro atual que pode ser editada independentemente 
              e depois mesclada de volta.
            </p>
            <Input
              placeholder="Nome do branch"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={loading || !branchName.trim()}>
              {loading ? 'Criando...' : 'Criar Branch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mesclar Branch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja mesclar este branch ao quadro principal? 
              Isso substituirá todos os objetos do quadro principal pelos objetos deste branch.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMergeDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleMerge} disabled={loading}>
              {loading ? 'Mesclando...' : 'Mesclar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
