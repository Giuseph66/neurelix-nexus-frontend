import { 
  Copy, 
  Trash2, 
  Lock, 
  Unlock, 
  FlipHorizontal, 
  FlipVertical,
  ChevronUp,
  ChevronDown,
  Clipboard,
  CheckSquare
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { FabricObject } from "fabric";

interface CanvasContextMenuProps {
  children: React.ReactNode;
  selectedObject: FabricObject | null;
  onDuplicate: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onToggleLock: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onConvertToTarefas?: () => void;
}

export function CanvasContextMenu({
  children,
  selectedObject,
  onDuplicate,
  onDelete,
  onCopy,
  onPaste,
  onBringForward,
  onSendBackward,
  onToggleLock,
  onFlipHorizontal,
  onFlipVertical,
  onConvertToTarefas,
}: CanvasContextMenuProps) {
  const isLocked = selectedObject?.get('lockMovementX') && selectedObject?.get('lockMovementY');

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {selectedObject ? (
          <>
            <ContextMenuItem onClick={onCopy}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar
            </ContextMenuItem>
            <ContextMenuItem onClick={onDuplicate}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicar
            </ContextMenuItem>
            <ContextMenuItem onClick={onPaste}>
              <Clipboard className="h-4 w-4 mr-2" />
              Colar
            </ContextMenuItem>
            <ContextMenuSeparator />
            {onConvertToTarefas && (
              <>
                <ContextMenuItem onClick={onConvertToTarefas}>
                  <CheckSquare className="h-4 w-4 mr-2" />
                  Converter em Tarefas
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            )}
            <ContextMenuItem onClick={onBringForward}>
              <ChevronUp className="h-4 w-4 mr-2" />
              Trazer para frente
            </ContextMenuItem>
            <ContextMenuItem onClick={onSendBackward}>
              <ChevronDown className="h-4 w-4 mr-2" />
              Enviar para trás
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onFlipHorizontal}>
              <FlipHorizontal className="h-4 w-4 mr-2" />
              Inverter horizontal
            </ContextMenuItem>
            <ContextMenuItem onClick={onFlipVertical}>
              <FlipVertical className="h-4 w-4 mr-2" />
              Inverter vertical
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onToggleLock}>
              {isLocked ? (
                <>
                  <Unlock className="h-4 w-4 mr-2" />
                  Desbloquear
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-2" />
                  Bloquear
                </>
              )}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </ContextMenuItem>
          </>
        ) : (
          <ContextMenuItem onClick={onPaste}>
            <Clipboard className="h-4 w-4 mr-2" />
            Colar
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
