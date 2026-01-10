import { useEffect, useState, useRef } from "react";
import { FabricObject } from "fabric";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "./ColorPicker";
import {
    Copy,
    Trash2,
    Lock,
    Unlock,
    FlipHorizontal,
    FlipVertical,
    MoveUp,
    MoveDown,
    X
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface FloatingPropertiesToolbarProps {
    selectedObject: FabricObject | null;
    position: { x: number; y: number } | null;
    onClose: () => void;
    onUpdate: () => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onBringForward: () => void;
    onSendBackward: () => void;
}

export function FloatingPropertiesToolbar({
    selectedObject,
    position,
    onClose,
    onUpdate,
    onDelete,
    onDuplicate,
    onBringForward,
    onSendBackward
}: FloatingPropertiesToolbarProps) {
    const [strokeColor, setStrokeColor] = useState("#1e293b");
    const [fillColor, setFillColor] = useState("transparent");
    const [strokeWidth, setStrokeWidth] = useState(2);
    const [opacity, setOpacity] = useState(100);
    const [isLocked, setIsLocked] = useState(false);
    const toolbarRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (selectedObject) {
            setStrokeColor((selectedObject.stroke as string) || "#1e293b");
            setFillColor((selectedObject.fill as string) || "transparent");
            setStrokeWidth(selectedObject.strokeWidth || 2);
            setOpacity(Math.round((selectedObject.opacity || 1) * 100));
            setIsLocked(selectedObject.lockMovementX || false);
        }
    }, [selectedObject]);

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (position) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [position, onClose]);

    if (!selectedObject || !position) return null;

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

    // Calculate position to keep it on screen
    const style = {
        top: Math.min(position.y, window.innerHeight - 350),
        left: Math.min(position.x, window.innerWidth - 250),
    };

    return (
        <TooltipProvider delayDuration={300}>
            <div
                ref={toolbarRef}
                className="fixed z-50 w-64 bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-xl p-3 flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-200"
                style={style}
            >
                <div className="flex items-center justify-between border-b pb-2">
                    <span className="font-medium text-sm">Propriedades</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Ações rápidas */}
                <div className="flex gap-1 flex-wrap justify-between">
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
                </div>

                <Separator />

                {/* Cores */}
                <div className="space-y-3">
                    <div className="flex gap-3 justify-between">
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
                    <div className="flex justify-between">
                        <Label className="text-xs text-muted-foreground">Espessura</Label>
                        <span className="text-xs text-muted-foreground">{strokeWidth}px</span>
                    </div>
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
                    <div className="flex justify-between">
                        <Label className="text-xs text-muted-foreground">Opacidade</Label>
                        <span className="text-xs text-muted-foreground">{opacity}%</span>
                    </div>
                    <Slider
                        value={[opacity]}
                        onValueChange={handleOpacityChange}
                        min={0}
                        max={100}
                        step={5}
                        className="w-full"
                    />
                </div>

                <Separator />

                <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                        onDelete();
                        onClose();
                    }}
                >
                    <Trash2 className="h-4 w-4 mr-2" /> Excluir Objeto
                </Button>
            </div>
        </TooltipProvider>
    );
}
