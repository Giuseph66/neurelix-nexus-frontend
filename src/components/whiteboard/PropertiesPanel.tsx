import { useEffect, useState } from "react";
import { FabricObject } from "fabric";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "./ColorPicker";
import { 
  AlignHorizontalJustifyCenter, 
  AlignVerticalJustifyCenter,
  Copy,
  Trash2,
  Lock,
  Unlock,
  FlipHorizontal,
  FlipVertical,
  MoveUp,
  MoveDown
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

interface PropertiesPanelProps {
  selectedObject: FabricObject | null;
  onUpdate: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
}

export function PropertiesPanel({ 
  selectedObject, 
  onUpdate, 
  onDelete,
  onDuplicate,
  onBringForward,
  onSendBackward
}: PropertiesPanelProps) {
  const [strokeColor, setStrokeColor] = useState("#1e293b");
  const [fillColor, setFillColor] = useState("transparent");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [opacity, setOpacity] = useState(100);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    if (selectedObject) {
      setStrokeColor((selectedObject.stroke as string) || "#1e293b");
      setFillColor((selectedObject.fill as string) || "transparent");
      setStrokeWidth(selectedObject.strokeWidth || 2);
      setOpacity(Math.round((selectedObject.opacity || 1) * 100));
      setIsLocked(selectedObject.lockMovementX || false);
    }
  }, [selectedObject]);

  if (!selectedObject) {
    return (
      <div className="w-56 border-l bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground text-center">
          Selecione um objeto para editar suas propriedades
        </p>
      </div>
    );
  }

  const handleStrokeColorChange = (color: string) => {
    setStrokeColor(color);
    selectedObject.set('stroke', color);
    onUpdate();
  };

  const handleFillColorChange = (color: string) => {
    setFillColor(color);
    selectedObject.set('fill', color);
    onUpdate();
  };

  const handleStrokeWidthChange = (value: number[]) => {
    const width = value[0];
    setStrokeWidth(width);
    selectedObject.set('strokeWidth', width);
    onUpdate();
  };

  const handleOpacityChange = (value: number[]) => {
    const op = value[0];
    setOpacity(op);
    selectedObject.set('opacity', op / 100);
    onUpdate();
  };

  const handleToggleLock = () => {
    const locked = !isLocked;
    setIsLocked(locked);
    selectedObject.set({
      lockMovementX: locked,
      lockMovementY: locked,
      lockRotation: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      selectable: !locked,
    });
    onUpdate();
  };

  const handleFlipH = () => {
    selectedObject.set('flipX', !selectedObject.flipX);
    onUpdate();
  };

  const handleFlipV = () => {
    selectedObject.set('flipY', !selectedObject.flipY);
    onUpdate();
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="w-56 border-l bg-muted/30 flex flex-col">
        <div className="p-3 border-b">
          <span className="font-medium text-sm">Propriedades</span>
        </div>
        
        <div className="flex-1 overflow-auto p-3 space-y-4">
          {/* Ações rápidas */}
          <div className="flex gap-1 flex-wrap">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={onDuplicate}>
                  <Copy className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Duplicar (Ctrl+D)</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleToggleLock}>
                  {isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isLocked ? 'Desbloquear' : 'Bloquear'}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleFlipH}>
                  <FlipHorizontal className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Espelhar H</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleFlipV}>
                  <FlipVertical className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Espelhar V</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={onBringForward}>
                  <MoveUp className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Trazer para frente</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={onSendBackward}>
                  <MoveDown className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Enviar para trás</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="destructive" size="icon" className="h-8 w-8" onClick={onDelete}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Excluir (Del)</TooltipContent>
            </Tooltip>
          </div>

          <Separator />

          {/* Cores */}
          <div className="space-y-3">
            <div className="flex gap-3">
              <ColorPicker 
                color={strokeColor} 
                onChange={handleStrokeColorChange} 
                label="Contorno"
              />
              <ColorPicker 
                color={fillColor} 
                onChange={handleFillColorChange} 
                label="Preenchimento"
              />
            </div>
          </div>

          {/* Espessura do contorno */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Espessura: {strokeWidth}px
            </Label>
            <Slider
              value={[strokeWidth]}
              onValueChange={handleStrokeWidthChange}
              min={1}
              max={20}
              step={1}
              className="w-full"
            />
          </div>

          {/* Opacidade */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Opacidade: {opacity}%
            </Label>
            <Slider
              value={[opacity]}
              onValueChange={handleOpacityChange}
              min={0}
              max={100}
              step={5}
              className="w-full"
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
