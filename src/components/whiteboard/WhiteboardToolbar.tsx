import {
  MousePointer2,
  Hand,
  Pencil,
  Eraser,
  Square,
  Circle,
  Minus,
  ArrowRight,
  Type,
  StickyNote,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Image,
  GripHorizontal,
  Minimize2,
  Maximize2,
  RefreshCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { ToolType } from "./types";
import { ColorPicker } from "./ColorPicker";
import { ExportMenu } from "./ExportMenu";
import { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface WhiteboardToolbarProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  strokeColor: string;
  onStrokeColorChange: (color: string) => void;
  fillColor: string;
  onFillColorChange: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
  onAddImage: (url: string) => void;
  onExportPNG: () => void;
  onExportSVG: () => void;
  onExportJSON: () => void;
  onReloadObjects: () => void;
}

const tools: { id: ToolType; icon: React.ElementType; label: string; shortcut?: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Selecionar', shortcut: 'V' },
  { id: 'pan', icon: Hand, label: 'Mover canvas', shortcut: 'H' },
  { id: 'pencil', icon: Pencil, label: 'Lápis', shortcut: 'P' },
  { id: 'eraser', icon: Eraser, label: 'Borracha', shortcut: 'E' },
];

const shapes: { id: ToolType; icon: React.ElementType; label: string; shortcut?: string }[] = [
  { id: 'rectangle', icon: Square, label: 'Retângulo', shortcut: 'R' },
  { id: 'circle', icon: Circle, label: 'Círculo', shortcut: 'O' },
  { id: 'line', icon: Minus, label: 'Linha', shortcut: 'L' },
  { id: 'arrow', icon: ArrowRight, label: 'Seta', shortcut: 'A' },
];

const extras: { id: ToolType; icon: React.ElementType; label: string; shortcut?: string }[] = [
  { id: 'text', icon: Type, label: 'Texto', shortcut: 'T' },
  { id: 'postit', icon: StickyNote, label: 'Post-it', shortcut: 'N' },
];

export function WhiteboardToolbar({
  activeTool,
  onToolChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  strokeColor,
  onStrokeColorChange,
  fillColor,
  onFillColorChange,
  strokeWidth,
  onStrokeWidthChange,
  onAddImage,
  onExportPNG,
  onExportSVG,
  onExportJSON,
  onReloadObjects,
}: WhiteboardToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        onAddImage(url);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragRef.current) return;

      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;

      setPosition({
        x: dragRef.current.initialX + deltaX,
        y: dragRef.current.initialY + deltaY,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "absolute z-10 bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg transition-shadow",
          isDragging ? "cursor-grabbing shadow-xl" : "shadow-lg",
          isMinimized ? "p-1" : "p-1.5"
        )}
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          top: '1rem',
          left: '50%',
          marginLeft: '-50%', // Centering fix when using left: 50%
        }}
      >
        <div className={cn("flex items-center gap-1", isMinimized ? "flex-col" : "flex-row")}>
          {/* Drag Handle */}
          <div
            className={cn(
              "flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors",
              isMinimized ? "w-8 h-4" : "w-4 h-8 mr-1"
            )}
            onMouseDown={handleMouseDown}
          >
            <GripHorizontal className={cn("w-4 h-4", isMinimized ? "" : "rotate-90")} />
          </div>

          {isMinimized ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsMinimized(false)}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Expandir barra de ferramentas</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <>
              {/* Ferramentas básicas */}
              {tools.map((tool) => (
                <Tooltip key={tool.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={activeTool === tool.id ? "default" : "ghost"}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onToolChange(tool.id)}
                    >
                      <tool.icon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{tool.label} {tool.shortcut && <span className="text-muted-foreground ml-1">({tool.shortcut})</span>}</p>
                  </TooltipContent>
                </Tooltip>
              ))}

              <Separator orientation="vertical" className="h-6 mx-1" />

              {/* Formas */}
              {shapes.map((shape) => (
                <Tooltip key={shape.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={activeTool === shape.id ? "default" : "ghost"}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onToolChange(shape.id)}
                    >
                      <shape.icon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{shape.label} {shape.shortcut && <span className="text-muted-foreground ml-1">({shape.shortcut})</span>}</p>
                  </TooltipContent>
                </Tooltip>
              ))}

              <Separator orientation="vertical" className="h-6 mx-1" />

              {/* Texto e Post-it */}
              {extras.map((extra) => (
                <Tooltip key={extra.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={activeTool === extra.id ? "default" : "ghost"}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onToolChange(extra.id)}
                    >
                      <extra.icon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{extra.label} {extra.shortcut && <span className="text-muted-foreground ml-1">({extra.shortcut})</span>}</p>
                  </TooltipContent>
                </Tooltip>
              ))}

              {/* Imagem */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Image className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Adicionar imagem</p>
                </TooltipContent>
              </Tooltip>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />

              <Separator orientation="vertical" className="h-6 mx-1" />

              {/* Cores */}
              <ColorPicker color={strokeColor} onChange={onStrokeColorChange} />
              <ColorPicker color={fillColor} onChange={onFillColorChange} />

              {/* Espessura */}
              <div className="w-20 px-2">
                <Slider
                  value={[strokeWidth]}
                  onValueChange={([v]) => onStrokeWidthChange(v)}
                  min={1}
                  max={20}
                  step={1}
                />
              </div>

              <Separator orientation="vertical" className="h-6 mx-1" />

              {/* Undo/Redo */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onUndo}
                    disabled={!canUndo}
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Desfazer <span className="text-muted-foreground ml-1">(Ctrl+Z)</span></p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onRedo}
                    disabled={!canRedo}
                  >
                    <Redo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Refazer <span className="text-muted-foreground ml-1">(Ctrl+Y)</span></p>
                </TooltipContent>
              </Tooltip>

              <Separator orientation="vertical" className="h-6 mx-1" />

              {/* Zoom */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onZoomOut}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Diminuir zoom (Ctrl+-)</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 min-w-[60px] text-xs font-mono"
                    onClick={onZoomReset}
                  >
                    {Math.round(zoom * 100)}%
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Resetar zoom (Ctrl+0)</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onZoomIn}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Aumentar zoom (Ctrl++)</p>
                </TooltipContent>
              </Tooltip>

              <Separator orientation="vertical" className="h-6 mx-1" />

              <ExportMenu
                onExportPNG={onExportPNG}
                onExportSVG={onExportSVG}
                onExportJSON={onExportJSON}
              />

              <Separator orientation="vertical" className="h-6 mx-1" />

              {/* Recarregar objetos do quadro */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onReloadObjects}
                  >
                    <RefreshCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Recarregar objetos do quadro</p>
                </TooltipContent>
              </Tooltip>

              <Separator orientation="vertical" className="h-6 mx-1" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setIsMinimized(true)}
                  >
                    <Minimize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Minimizar</p>
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
