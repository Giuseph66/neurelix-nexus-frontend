import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Canvas as FabricCanvas, Rect, Circle, Line, IText, FabricObject, PencilBrush, Point, TPointerEventInfo, TPointerEvent, FabricImage, Polygon, Group } from "fabric";
import { ToolType, CanvasViewport } from "./types";
import { useWhiteboardHistory } from "@/hooks/useWhiteboardHistory";
import { toast } from "sonner";

export interface WhiteboardCanvasRef {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  undo: () => void;
  redo: () => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  selectAll: () => void;
  copy: () => void;
  paste: () => void;
  bringForward: () => void;
  sendBackward: () => void;
  addImage: (url: string) => void;
  exportPNG: () => void;
  exportSVG: () => void;
  exportJSON: () => void;
  getCanvas: () => FabricCanvas | null;
  getSelectedObject: () => FabricObject | null;
  renderAll: () => void;
}

type ObjectsChangeReason = 'draw_end' | 'text_change' | 'transform';

interface WhiteboardCanvasProps {
  whiteboardId: string | null;
  activeTool: ToolType;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  onObjectsChange: (objects: FabricObject[], reason?: ObjectsChangeReason) => void;
  onViewportChange: (viewport: CanvasViewport) => void;
  onSelectionChange: (object: FabricObject | null) => void;
  initialViewport?: CanvasViewport;
  initialSnapshot?: Record<string, unknown> | null;
  onCanUndoChange: (canUndo: boolean) => void;
  onCanRedoChange: (canRedo: boolean) => void;
  showGrid?: boolean;
  onToolChange?: (tool: ToolType) => void;
  onContextMenu?: (e: React.MouseEvent, object: FabricObject | null) => void;
}

// Draw grid on the lower canvas (background layer)
function drawGrid(canvas: FabricCanvas, gridSize: number = 20) {
  const lowerCanvas = canvas.lowerCanvasEl;
  if (!lowerCanvas) return;

  const ctx = lowerCanvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.getWidth();
  const height = canvas.getHeight();
  const zoom = canvas.getZoom();
  const vpt = canvas.viewportTransform;

  if (!vpt) return;

  // Save and set background (using design system neutral)
  ctx.save();
  ctx.fillStyle = '#000000'; // Black background
  ctx.fillRect(0, 0, width, height);

  const offsetX = vpt[4];
  const offsetY = vpt[5];
  const scaledGridSize = gridSize * zoom;

  const startX = Math.floor(-offsetX / scaledGridSize) * scaledGridSize + offsetX;
  const startY = Math.floor(-offsetY / scaledGridSize) * scaledGridSize + offsetY;

  // Minor grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;

  for (let x = startX; x < width; x += scaledGridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = startY; y < height; y += scaledGridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Major grid lines (every 5 cells)
  const majorGridSize = scaledGridSize * 5;
  const majorStartX = Math.floor(-offsetX / majorGridSize) * majorGridSize + offsetX;
  const majorStartY = Math.floor(-offsetY / majorGridSize) * majorGridSize + offsetY;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';

  for (let x = majorStartX; x < width; x += majorGridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = majorStartY; y < height; y += majorGridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.restore();
}

// Create arrow with arrowhead
function createArrow(x1: number, y1: number, x2: number, y2: number, color: string, width: number): Group {
  const headLength = 15;
  const angle = Math.atan2(y2 - y1, x2 - x1);

  const line = new Line([x1, y1, x2, y2], {
    stroke: color,
    strokeWidth: width,
    selectable: false,
  });

  // Arrowhead points
  const arrowHead = new Polygon([
    { x: x2, y: y2 },
    { x: x2 - headLength * Math.cos(angle - Math.PI / 6), y: y2 - headLength * Math.sin(angle - Math.PI / 6) },
    { x: x2 - headLength * Math.cos(angle + Math.PI / 6), y: y2 - headLength * Math.sin(angle + Math.PI / 6) },
  ], {
    fill: color,
    stroke: color,
    strokeWidth: 1,
    selectable: false,
  });

  return new Group([line, arrowHead], {
    selectable: true,
    evented: true,
  });
}

export const WhiteboardCanvas = forwardRef<WhiteboardCanvasRef, WhiteboardCanvasProps>(({
  whiteboardId,
  activeTool,
  strokeColor,
  fillColor,
  strokeWidth,
  onObjectsChange,
  onViewportChange,
  onSelectionChange,
  initialViewport = { x: 0, y: 0, zoom: 1 },
  initialSnapshot = null,
  onCanUndoChange,
  onCanRedoChange,
  showGrid = true,
  onToolChange,
  onContextMenu,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false); // Track middle-mouse pan state
  const lastPosRef = useRef({ x: 0, y: 0 });
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const tempShapeRef = useRef<FabricObject | null>(null);
  const clipboardRef = useRef<FabricObject[]>([]);
  const objectsLoadedRef = useRef(false);
  const initialObjectsRef = useRef<string>('');
  const whiteboardIdRef = useRef<string>('');
  const lastReasonRef = useRef<ObjectsChangeReason | undefined>(undefined);

  const { saveState, undo, redo, canUndo, canRedo } = useWhiteboardHistory();

  useEffect(() => {
    onCanUndoChange(canUndo);
    onCanRedoChange(canRedo);
  }, [canUndo, canRedo, onCanUndoChange, onCanRedoChange]);

  // Initialize canvas - ONLY ONCE
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current || fabricRef.current) return;

    const container = containerRef.current;
    const canvas = new FabricCanvas(canvasRef.current, {
      width: container.offsetWidth,
      height: container.offsetHeight,
      backgroundColor: "#000000", // Black background
      selection: true,
      preserveObjectStacking: true,
    });

    canvas.setZoom(initialViewport.zoom);
    canvas.absolutePan(new Point(-initialViewport.x, -initialViewport.y));

    canvas.freeDrawingBrush = new PencilBrush(canvas);
    canvas.freeDrawingBrush.color = strokeColor;
    canvas.freeDrawingBrush.width = strokeWidth;

    fabricRef.current = canvas;
    (canvas as any).__suppressOnObjectsChange = false;
    canvas.subTargetCheck = true;

    const handleResize = () => {
      canvas.setDimensions({
        width: container.offsetWidth,
        height: container.offsetHeight,
      });
      canvas.renderAll();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Draw grid BEFORE objects using the before:render event
    if (showGrid) {
      canvas.on('before:render', () => {
        drawGrid(canvas);
      });
    }

    const saveAndNotify = (reason?: ObjectsChangeReason) => {
      if ((canvas as any).__suppressOnObjectsChange) {
        return;
      }
      lastReasonRef.current = reason;
      onObjectsChange(canvas.getObjects(), reason);
      saveState(JSON.stringify(canvas.toJSON()));
    };

    const handleObjectModified = () => saveAndNotify('transform');
    const handleObjectAdded = () => saveAndNotify('draw_end');
    const handleObjectRemoved = () => saveAndNotify('transform');
    const handleTextChanged = () => saveAndNotify('text_change');
    // Fabric free drawing often emits `path:created` (and not always `object:added`)
    const handlePathCreated = () => saveAndNotify('draw_end');

    canvas.on('object:modified', handleObjectModified);
    canvas.on('object:added', handleObjectAdded);
    canvas.on('object:removed', handleObjectRemoved);
    canvas.on('text:changed' as any, handleTextChanged as any);
    canvas.on('path:created' as any, handlePathCreated as any);

    canvas.on('selection:created', (e) => {
      onSelectionChange(e.selected?.[0] || null);
    });

    canvas.on('selection:updated', (e) => {
      onSelectionChange(e.selected?.[0] || null);
    });

    canvas.on('selection:cleared', () => {
      onSelectionChange(null);
    });

    // Save initial empty state
    setTimeout(() => {
      saveState(JSON.stringify(canvas.toJSON()));
    }, 100);

    return () => {
      resizeObserver.disconnect();
      canvas.off('object:modified', handleObjectModified);
      canvas.off('object:added', handleObjectAdded);
      canvas.off('object:removed', handleObjectRemoved);
      canvas.off('text:changed' as any, handleTextChanged as any);
      canvas.off('path:created' as any, handlePathCreated as any);
      canvas.dispose();
      fabricRef.current = null;
      objectsLoadedRef.current = false;
    };
  }, []); // Only run once on mount

  // Load initial objects - separate effect to prevent recreation
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const currentWhiteboardId = whiteboardId ?? 'none';
    const snapshotKey = JSON.stringify(initialSnapshot ?? {});

    // Detect if whiteboard changed
    if (currentWhiteboardId !== whiteboardIdRef.current) {
      // Whiteboard changed, reset loaded flag
      objectsLoadedRef.current = false;
      whiteboardIdRef.current = currentWhiteboardId;
    }

    // Only load if objects actually changed and haven't been loaded yet
    if (snapshotKey === initialObjectsRef.current && objectsLoadedRef.current) {
      return;
    }
    initialObjectsRef.current = snapshotKey;

    // Load initial snapshot from database
    const canvasAny = canvas as any;
    canvasAny.__suppressOnObjectsChange = true;
    canvas.clear();
    canvas.backgroundColor = "#000000";

    const jsonToLoad = initialSnapshot && typeof initialSnapshot === 'object'
      ? initialSnapshot
      : { objects: [], background: "#000000" };

    canvas.loadFromJSON(jsonToLoad as any).then(() => {
      // Force a consistent background (avoids black/blue flip across loaders)
      canvas.backgroundColor = "#000000";
      canvas.renderAll();
      saveState(JSON.stringify(canvas.toJSON()));
      objectsLoadedRef.current = true;
      canvasAny.__suppressOnObjectsChange = false;
    }).catch(() => {
      canvasAny.__suppressOnObjectsChange = false;
    });
  }, [whiteboardId, initialSnapshot, saveState]);

  // Update brush settings
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas?.freeDrawingBrush) return;

    canvas.freeDrawingBrush.color = activeTool === 'eraser' ? '#000000' : strokeColor;
    canvas.freeDrawingBrush.width = activeTool === 'eraser' ? 20 : strokeWidth;
  }, [strokeColor, strokeWidth, activeTool]);

  // Handle tool changes
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.isDrawingMode = false;
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';

    // IMPORTANT: Disable selection for shape tools to prevent dragging existing objects
    const isShapeTool = ['rectangle', 'circle', 'line', 'arrow', 'text', 'postit'].includes(activeTool);

    switch (activeTool) {
      case 'select':
        canvas.selection = true;
        // Enable all objects to be selectable
        canvas.getObjects().forEach(obj => {
          obj.set({ selectable: true, evented: true });
        });
        break;
      case 'pan':
        canvas.selection = false;
        canvas.defaultCursor = 'grab';
        canvas.hoverCursor = 'grab';
        canvas.getObjects().forEach(obj => {
          obj.set({ selectable: false, evented: false });
        });
        break;
      case 'pencil':
        canvas.isDrawingMode = true;
        break;
      case 'eraser':
        canvas.isDrawingMode = true;
        break;
      default:
        // For shape tools, disable selection and object interaction
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        canvas.hoverCursor = 'crosshair';
        if (isShapeTool) {
          canvas.getObjects().forEach(obj => {
            obj.set({ selectable: false, evented: false });
          });
        }
        break;
    }

    canvas.discardActiveObject();
    canvas.renderAll();
  }, [activeTool]);

  // Pan and shape drawing
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleMouseDown = (opt: TPointerEventInfo<TPointerEvent>) => {
      const e = opt.e as MouseEvent;

      // Middle mouse button (button 1) for panning
      if (e.button === 1) {
        setIsPanning(true);
        canvas.defaultCursor = 'grabbing';
        canvas.selection = false; // Disable selection while panning
        lastPosRef.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
      }

      // Right click (button 2) for context menu
      if (e.button === 2) {
        if (onContextMenu) {
          const pointer = canvas.getPointer(e);
          // Check if we clicked on an object
          const target = canvas.findTarget(e);
          if (target) {
            canvas.setActiveObject(target);
            onSelectionChange(target);
          }
          // Pass the original mouse event for positioning
          onContextMenu(e as unknown as React.MouseEvent, target || null);
        }
        return;
      }

      // For shape tools, always start drawing, don't select
      if (activeTool === 'pan') {
        setIsDrawing(true);
        canvas.defaultCursor = 'grabbing';
        lastPosRef.current = { x: e.clientX, y: e.clientY };
      } else if (['rectangle', 'circle', 'line', 'arrow', 'text', 'postit'].includes(activeTool)) {
        const pointer = canvas.getPointer(e);
        startPointRef.current = { x: pointer.x, y: pointer.y };
        setIsDrawing(true);
      }
    };

    const handleMouseMove = (opt: TPointerEventInfo<TPointerEvent>) => {
      const e = opt.e as MouseEvent;

      // Handle middle-mouse panning
      if (isPanning) {
        const deltaX = e.clientX - lastPosRef.current.x;
        const deltaY = e.clientY - lastPosRef.current.y;

        const vpt = canvas.viewportTransform;
        if (vpt) {
          vpt[4] += deltaX;
          vpt[5] += deltaY;
          canvas.requestRenderAll();

          onViewportChange({
            x: -vpt[4] / canvas.getZoom(),
            y: -vpt[5] / canvas.getZoom(),
            zoom: canvas.getZoom(),
          });
        }

        lastPosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      if (!isDrawing) return;

      if (activeTool === 'pan') {
        const deltaX = e.clientX - lastPosRef.current.x;
        const deltaY = e.clientY - lastPosRef.current.y;

        const vpt = canvas.viewportTransform;
        if (vpt) {
          vpt[4] += deltaX;
          vpt[5] += deltaY;
          canvas.requestRenderAll();

          onViewportChange({
            x: -vpt[4] / canvas.getZoom(),
            y: -vpt[5] / canvas.getZoom(),
            zoom: canvas.getZoom(),
          });
        }

        lastPosRef.current = { x: e.clientX, y: e.clientY };
      } else if (startPointRef.current && ['rectangle', 'circle', 'line', 'arrow'].includes(activeTool)) {
        // ... (existing shape drawing logic)
        const pointer = canvas.getPointer(e);

        if (tempShapeRef.current) {
          canvas.remove(tempShapeRef.current);
        }

        let shape: FabricObject | null = null;
        const startX = startPointRef.current.x;
        const startY = startPointRef.current.y;
        const width = pointer.x - startX;
        const height = pointer.y - startY;

        switch (activeTool) {
          case 'rectangle':
            shape = new Rect({
              left: width > 0 ? startX : pointer.x,
              top: height > 0 ? startY : pointer.y,
              width: Math.abs(width),
              height: Math.abs(height),
              fill: fillColor,
              stroke: strokeColor,
              strokeWidth: strokeWidth,
            });
            break;
          case 'circle':
            const radius = Math.sqrt(width * width + height * height) / 2;
            shape = new Circle({
              left: startX - radius,
              top: startY - radius,
              radius: radius,
              fill: fillColor,
              stroke: strokeColor,
              strokeWidth: strokeWidth,
            });
            break;
          case 'line':
            shape = new Line([startX, startY, pointer.x, pointer.y], {
              stroke: strokeColor,
              strokeWidth: strokeWidth,
            });
            break;
          case 'arrow':
            shape = createArrow(startX, startY, pointer.x, pointer.y, strokeColor, strokeWidth);
            break;
        }

        if (shape) {
          shape.set({ selectable: false, evented: false });
          canvas.add(shape);
          tempShapeRef.current = shape;
          canvas.renderAll();
        }
      }
    };

    const handleMouseUp = (opt: TPointerEventInfo<TPointerEvent>) => {
      const e = opt.e as MouseEvent;

      if (isPanning) {
        setIsPanning(false);
        canvas.defaultCursor = 'default';
        canvas.selection = true; // Re-enable selection
        return;
      }

      if (activeTool === 'pan') {
        canvas.defaultCursor = 'grab';
      } else if (startPointRef.current) {
        const pointer = canvas.getPointer(e);

        if (tempShapeRef.current) {
          canvas.remove(tempShapeRef.current);
          tempShapeRef.current = null;
        }

        const startX = startPointRef.current.x;
        const startY = startPointRef.current.y;
        const width = pointer.x - startX;
        const height = pointer.y - startY;

        if (Math.abs(width) > 5 || Math.abs(height) > 5) {
          let shape: FabricObject | null = null;

          switch (activeTool) {
            case 'rectangle':
              shape = new Rect({
                left: width > 0 ? startX : pointer.x,
                top: height > 0 ? startY : pointer.y,
                width: Math.abs(width),
                height: Math.abs(height),
                fill: fillColor,
                stroke: strokeColor,
                strokeWidth: strokeWidth,
              });
              break;
            case 'circle':
              const radius = Math.sqrt(width * width + height * height) / 2;
              shape = new Circle({
                left: startX - radius,
                top: startY - radius,
                radius: radius,
                fill: fillColor,
                stroke: strokeColor,
                strokeWidth: strokeWidth,
              });
              break;
            case 'line':
              shape = new Line([startX, startY, pointer.x, pointer.y], {
                stroke: strokeColor,
                strokeWidth: strokeWidth,
              });
              break;
            case 'arrow':
              shape = createArrow(startX, startY, pointer.x, pointer.y, strokeColor, strokeWidth);
              break;
          case 'text': {
            const text = new IText('Texto', {
              left: startX,
              top: startY,
              fontSize: 20,
              fill: strokeColor,
              fontFamily: 'Inter, sans-serif',
            });
            canvas.add(text);
            text.set({ selectable: true, evented: true });
            canvas.setActiveObject(text);
            text.enterEditing();
            if (onToolChange) onToolChange('select');
            break;
          }
          case 'postit': {
            const postit = new Rect({
              left: 0,
              top: 0,
              width: 150,
              height: 150,
              fill: '#fef08a',
              stroke: '#eab308',
              strokeWidth: 1,
              rx: 4,
              ry: 4,
            });

            const postitText = new IText('Nota', {
              left: 10,
              top: 10,
              fontSize: 14,
              fill: '#1e293b',
              fontFamily: 'Inter, sans-serif',
            });

            const group = new Group([postit, postitText], {
              left: startX,
              top: startY,
            });

            canvas.add(group);
            canvas.setActiveObject(group);
            if (onToolChange) onToolChange('select');
            break;
          }
          }

          if (shape) {
            canvas.add(shape);
            // Re-enable selection after creating
            shape.set({ selectable: true, evented: true });
          }
        } else if (activeTool === 'text') {
          const text = new IText('Texto', {
            left: startX,
            top: startY,
            fontSize: 20,
            fill: strokeColor,
            fontFamily: 'Inter, sans-serif',
          });
          canvas.add(text);
          text.set({ selectable: true, evented: true });
          canvas.setActiveObject(text);
          text.enterEditing();
          if (onToolChange) onToolChange('select');
        } else if (activeTool === 'postit') {
          const postit = new Rect({
            left: 0,
            top: 0,
            width: 150,
            height: 150,
            fill: '#fef08a',
            stroke: '#eab308',
            strokeWidth: 1,
            rx: 4,
            ry: 4,
          });

          const postitText = new IText('Nota', {
            left: 10,
            top: 10,
            fontSize: 14,
            fill: '#1e293b',
            fontFamily: 'Inter, sans-serif',
          });

          const group = new Group([postit, postitText], {
            left: startX,
            top: startY,
          });

          canvas.add(group);
          canvas.setActiveObject(group);
          if (onToolChange) onToolChange('select');
        }

        canvas.renderAll();
        startPointRef.current = null;
      }

      setIsDrawing(false);
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [activeTool, isDrawing, isPanning, onViewportChange, strokeColor, fillColor, strokeWidth, onToolChange, onContextMenu]);

  // Zoom with mouse wheel
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleWheel = (opt: TPointerEventInfo<WheelEvent>) => {
      const delta = opt.e.deltaY;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** delta;

      if (zoom > 4) zoom = 4;
      if (zoom < 0.1) zoom = 0.1;

      canvas.zoomToPoint(new Point(opt.e.offsetX, opt.e.offsetY), zoom);
      opt.e.preventDefault();
      opt.e.stopPropagation();

      const vpt = canvas.viewportTransform;
      if (vpt) {
        onViewportChange({
          x: -vpt[4] / zoom,
          y: -vpt[5] / zoom,
          zoom: zoom,
        });
      }
    };

    canvas.on('mouse:wheel', handleWheel);
    return () => canvas.off('mouse:wheel', handleWheel);
  }, [onViewportChange]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const center = canvas.getCenter();
      let zoom = canvas.getZoom() * 1.2;
      if (zoom > 4) zoom = 4;
      canvas.zoomToPoint(new Point(center.left, center.top), zoom);
      const vpt = canvas.viewportTransform;
      if (vpt) onViewportChange({ x: -vpt[4] / zoom, y: -vpt[5] / zoom, zoom });
    },
    zoomOut: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const center = canvas.getCenter();
      let zoom = canvas.getZoom() / 1.2;
      if (zoom < 0.1) zoom = 0.1;
      canvas.zoomToPoint(new Point(center.left, center.top), zoom);
      const vpt = canvas.viewportTransform;
      if (vpt) onViewportChange({ x: -vpt[4] / zoom, y: -vpt[5] / zoom, zoom });
    },
    zoomReset: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.setZoom(1);
      canvas.absolutePan(new Point(0, 0));
      onViewportChange({ x: 0, y: 0, zoom: 1 });
    },
    undo: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const state = undo();
      if (state) {
        canvas.loadFromJSON(JSON.parse(state)).then(() => {
          canvas.renderAll();
          onObjectsChange(canvas.getObjects(), 'transform');
        });
      }
    },
    redo: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const state = redo();
      if (state) {
        canvas.loadFromJSON(JSON.parse(state)).then(() => {
          canvas.renderAll();
          onObjectsChange(canvas.getObjects(), 'transform');
        });
      }
    },
    deleteSelected: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const activeObjects = canvas.getActiveObjects();
      activeObjects.forEach(obj => canvas.remove(obj));
      canvas.discardActiveObject();
      canvas.renderAll();
    },
    duplicateSelected: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const activeObjects = canvas.getActiveObjects();
      if (activeObjects.length === 0) return;

      canvas.discardActiveObject();
      activeObjects.forEach(obj => {
        obj.clone().then((cloned: FabricObject) => {
          cloned.set({
            left: (obj.left || 0) + 20,
            top: (obj.top || 0) + 20,
          });
          canvas.add(cloned);
          canvas.setActiveObject(cloned);
        });
      });
    },
    selectAll: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.discardActiveObject();
      const selection = new (canvas as any).constructor.ActiveSelection(canvas.getObjects(), { canvas });
      canvas.setActiveObject(selection);
      canvas.renderAll();
    },
    copy: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const activeObjects = canvas.getActiveObjects();
      clipboardRef.current = activeObjects;
      toast.success('Copiado!');
    },
    paste: () => {
      const canvas = fabricRef.current;
      if (!canvas || clipboardRef.current.length === 0) return;

      clipboardRef.current.forEach(obj => {
        obj.clone().then((cloned: FabricObject) => {
          cloned.set({
            left: (obj.left || 0) + 30,
            top: (obj.top || 0) + 30,
          });
          canvas.add(cloned);
        });
      });
      canvas.renderAll();
      toast.success('Colado!');
    },
    bringForward: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        canvas.bringObjectForward(activeObject);
        canvas.renderAll();
      }
    },
    sendBackward: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        canvas.sendObjectBackwards(activeObject);
        canvas.renderAll();
      }
    },
    addImage: (url: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      FabricImage.fromURL(url).then((img) => {
        img.scaleToWidth(300);
        img.set({
          left: canvas.getWidth() / 2 - (img.getScaledWidth() / 2),
          top: canvas.getHeight() / 2 - (img.getScaledHeight() / 2),
        });
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
      });
    },
    exportPNG: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const dataURL = canvas.toDataURL({ format: 'png', multiplier: 2 });
      const link = document.createElement('a');
      link.download = 'whiteboard.png';
      link.href = dataURL;
      link.click();
      toast.success('PNG exportado!');
    },
    exportSVG: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const svg = canvas.toSVG();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = 'whiteboard.svg';
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('SVG exportado!');
    },
    exportJSON: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const json = JSON.stringify(canvas.toJSON(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = 'whiteboard.json';
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('JSON exportado!');
    },
    getCanvas: () => fabricRef.current,
    getSelectedObject: () => fabricRef.current?.getActiveObject() || null,
    renderAll: () => fabricRef.current?.renderAll(),
  }), [onViewportChange, onObjectsChange, undo, redo]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} />
    </div>
  );
});

WhiteboardCanvas.displayName = 'WhiteboardCanvas';
