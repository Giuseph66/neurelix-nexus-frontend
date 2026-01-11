import { useState, useCallback, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Plus, MoreVertical, Trash2, Loader2, GitBranch, ChevronLeft, ChevronRight, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useSidebar } from "@/components/ui/sidebar";
import { TldrawWhiteboard } from "@/components/whiteboard/TldrawWhiteboard";
//import { WhiteboardToolbar } from "@/components/whiteboard/WhiteboardToolbar";
import { WhiteboardHeader } from "@/components/whiteboard/WhiteboardHeader";
import { BearAssistant, type BearAssistantAnalysisRequest } from "@/components/whiteboard/BearAssistant";
import { BearCursor } from "@/components/whiteboard/BearCursor";
import { ToolType } from "@/components/whiteboard/types";
import { Editor, createShapeId } from "tldraw";
import { useWhiteboard } from "@/hooks/useWhiteboard";
import { useWhiteboardPresence } from "@/hooks/useWhiteboardPresence";
import { useWhiteboardBranches } from "@/hooks/useWhiteboardBranches";
import { toast } from "sonner";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function Whiteboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const [selectedWhiteboardId, setSelectedWhiteboardId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [zoom, setZoom] = useState(1);
  const [newBoardName, setNewBoardName] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [strokeColor, setStrokeColor] = useState("#f8fafc");
  const [fillColor, setFillColor] = useState("transparent");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [branches, setBranches] = useState<any[]>([]);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantAnalysisRequest, setAssistantAnalysisRequest] = useState<BearAssistantAnalysisRequest | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [hasRemoteActivity, setHasRemoteActivity] = useState(false);
  const [tldrawEditor, setTldrawEditor] = useState<Editor | null>(null);
  const [isBoardsDrawerOpen, setIsBoardsDrawerOpen] = useState(true);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingBoardName, setEditingBoardName] = useState('');
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const {
    whiteboards,
    whiteboard,
    loading,
    saving,
    createWhiteboard,
    deleteWhiteboard,
    renameWhiteboard,
    saveViewport,
    fetchWhiteboards,
  } = useWhiteboard({
    projectId: projectId || '',
    whiteboardId: selectedWhiteboardId || undefined
  });
  
  // Não minimizar automaticamente - será minimizado quando o usuário clicar no canvas

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      return await apiFetch(`/projects/${projectId}`);
    },
    enabled: !!projectId,
  });

  usePageTitle("Quadro Branco", project?.name);

  // Minimizar sidebar quando o whiteboard estiver aberto
  const { setOpen: setSidebarOpen } = useSidebar();
  const sidebarWasOpenRef = useRef<boolean | null>(null);
  
  useEffect(() => {
    // Ler estado atual do sidebar do cookie antes de minimizar
    const cookieValue = document.cookie
      .split('; ')
      .find(row => row.startsWith('sidebar:state='))
      ?.split('=')[1];
    
    const wasOpen = cookieValue === 'true';
    sidebarWasOpenRef.current = wasOpen;
    
    // Minimizar o sidebar
    setSidebarOpen(false);
    
    // Restaurar estado quando sair da página
    return () => {
      if (sidebarWasOpenRef.current) {
        setSidebarOpen(true);
      }
    };
  }, [setSidebarOpen]);

  // User presence
  const { collaborators, userColor, updateCursor, currentUserId } = useWhiteboardPresence({
    whiteboardId: selectedWhiteboardId,
    enabled: !!selectedWhiteboardId && !loading,
  });

  // Branches
  const { createBranch, mergeBranch, getBranches, loading: branchLoading } = useWhiteboardBranches({
    projectId: projectId || '',
    onBranchCreated: (newId) => {
      fetchWhiteboards();
      setSelectedWhiteboardId(newId);
    },
  });

  // Load branches when whiteboard changes
  useEffect(() => {
    if (whiteboards.length > 0 && !selectedWhiteboardId) {
      setSelectedWhiteboardId(whiteboards[0].id);
    }
  }, [whiteboards, selectedWhiteboardId]);

  useEffect(() => {
    if (selectedWhiteboardId && !whiteboard?.parent_branch_id) {
      getBranches(selectedWhiteboardId).then(setBranches);
    } else {
      setBranches([]);
    }
  }, [selectedWhiteboardId, whiteboard?.parent_branch_id]);

  const handleCreateWhiteboard = async () => {
    if (!newBoardName.trim()) return;
    const wb = await createWhiteboard(newBoardName.trim());
    if (wb) {
      setSelectedWhiteboardId(wb.id);
      setNewBoardName('');
      setIsDialogOpen(false);
    }
  };

  const handleRenameBoard = async (id: string) => {
    if (!editingBoardName.trim()) {
      setEditingBoardId(null);
      setEditingBoardName('');
      return;
    }
    await renameWhiteboard(id, editingBoardName.trim());
    setEditingBoardId(null);
    setEditingBoardName('');
  };

  const remoteActivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleRemoteActivity = useCallback(() => {
    setHasRemoteActivity(true);
    if (remoteActivityTimeoutRef.current) {
      clearTimeout(remoteActivityTimeoutRef.current);
    }
    remoteActivityTimeoutRef.current = setTimeout(() => {
      setHasRemoteActivity(false);
    }, 3000);
  }, []);

  const handleAnalyzeSelection = useCallback((payload: Omit<BearAssistantAnalysisRequest, 'id'>) => {
    const requestId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    setAssistantAnalysisRequest({ id: requestId, ...payload });
    setIsAssistantOpen(true);
  }, []);

  // Handle cursor movement for presence (tldraw)
  useEffect(() => {
    if (!tldrawEditor) return;

    const updateCursorPosition = () => {
      const viewportBounds = tldrawEditor.getViewportScreenBounds();
      const centerScreen = {
        x: viewportBounds.width / 2,
        y: viewportBounds.height / 2,
      };
      const centerPage = tldrawEditor.screenToPage(centerScreen);
      setCursorPosition({
        x: Math.round(centerPage.x),
        y: Math.round(centerPage.y),
      });
    };

    const unsubscribe = tldrawEditor.store.listen(() => {
      updateCursorPosition();
      // Cursor tracking is handled by tldraw's presence system
      // We'll update cursor position based on viewport center for now
    }, { scope: 'session' });

    return () => unsubscribe();
  }, [tldrawEditor, updateCursor]);

  // Handle creating elements from AI assistant (tldraw)
  const handleCreateElementsFromAI = useCallback((data: any) => {
    if (!tldrawEditor) return;

    // Check if it's the new graph format or old list format
    const isGraph = data.type === 'graph' && Array.isArray(data.nodes);
    const nodes = isGraph ? data.nodes : (data.items || data); // Fallback
    const edges = isGraph ? data.edges : [];

    if (!Array.isArray(nodes) || nodes.length === 0) {
      toast.error('Nenhum elemento válido retornado pelo assistente.');
      return;
    }

    // Calculate sizes first
    const processedNodes = nodes.map((node: any) => {
      const textLength = (node.text || node.content || "").length;
      const baseWidth = 200;
      const lines = Math.ceil(textLength / 25);
      const minHeight = 100;
      const calculatedHeight = Math.max(minHeight, lines * 24 + 40);

      return {
        ...node,
        width: baseWidth,
        height: calculatedHeight,
        id: node.id || createShapeId()
      };
    });

    // Simple Layout Logic - level-based layout
    const nodeMap = new Map();
    processedNodes.forEach((n: any) => nodeMap.set(n.id, n));

    const levels = new Map();
    const visited = new Set();
    const targets = new Set(edges.map((e: any) => e.to));
    const roots = processedNodes.filter((n: any) => !targets.has(n.id));
    const startNodes = roots.length > 0 ? roots : [processedNodes[0]];

    // BFS for levels
    const queue = startNodes.map((n: any) => ({ id: n.id, level: 0 }));
    let maxLevel = 0;

    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      levels.set(id, level);
      maxLevel = Math.max(maxLevel, level);

      edges.filter((e: any) => e.from === id).forEach((e: any) => {
        queue.push({ id: e.to, level: level + 1 });
      });
    }

    // Assign positions (vertical flow)
    const levelGroups: any[][] = Array(maxLevel + 1).fill(null).map(() => []);
    processedNodes.forEach((n: any) => {
      const level = levels.get(n.id) ?? 0;
      levelGroups[level].push(n);
    });

    const startX = 100;
    const startY = 100;
    const X_GAP = 120;
    const Y_GAP = 160;

    const rowWidths = levelGroups.map((group) => {
      if (group.length === 0) return 0;
      const totalWidth = group.reduce((sum, node) => sum + node.width, 0);
      return totalWidth + (group.length - 1) * X_GAP;
    });
    const maxRowWidth = Math.max(...rowWidths, 0);
    const rowHeights = levelGroups.map((group) =>
      group.reduce((max, node) => Math.max(max, node.height), 0)
    );

    let currentY = startY;
    levelGroups.forEach((group, rowIndex) => {
      if (group.length === 0) return;
      let currentX = startX + (maxRowWidth - rowWidths[rowIndex]) / 2;
      group.forEach((node) => {
        node.x = currentX;
        node.y = currentY;
        currentX += node.width + X_GAP;
      });
      currentY += rowHeights[rowIndex] + Y_GAP;
    });

    const graphBounds = processedNodes.reduce(
      (acc, node) => {
        const minX = Math.min(acc.minX, node.x);
        const minY = Math.min(acc.minY, node.y);
        const maxX = Math.max(acc.maxX, node.x + node.width);
        const maxY = Math.max(acc.maxY, node.y + node.height);
        return { minX, minY, maxX, maxY };
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );

    const existingBounds = tldrawEditor.getCurrentPageBounds();
    if (existingBounds && (existingBounds.w > 0 || existingBounds.h > 0)) {
      const margin = 140;
      const offsetX = existingBounds.minX - graphBounds.minX;
      const offsetY = (existingBounds.maxY + margin) - graphBounds.minY;
      processedNodes.forEach((node) => {
        node.x += offsetX;
        node.y += offsetY;
      });
    }

    // Create tldraw shapes
    const mapNodeColor = (value: string | undefined) => {
      switch ((value || '').toLowerCase()) {
        case 'yellow':
          return 'yellow';
        case 'blue':
          return 'light-blue';
        case 'green':
          return 'light-green';
        case 'pink':
          return 'light-red';
        case 'white':
          return 'white';
        default:
          return 'grey';
      }
    };

    tldrawEditor.batch(() => {
      processedNodes.forEach((el: any) => {
        const shapeId = createShapeId();
        const geoType =
          el.type === 'diamond'
            ? 'diamond'
            : el.type === 'circle'
              ? 'ellipse'
              : 'rectangle';
        const color = el.type === 'postit' ? mapNodeColor(el.color) : 'grey';

        tldrawEditor.createShape({
          id: shapeId,
          type: 'geo',
          x: el.x,
          y: el.y,
          props: {
            w: el.width,
            h: el.height,
            geo: geoType,
            fill: el.type === 'postit' ? 'solid' : 'none',
            color,
            labelColor: el.type === 'postit' ? 'black' : 'black',
            dash: 'draw',
            size: 'm',
            font: 'draw',
            text: el.text || el.content || '',
            align: 'middle',
            verticalAlign: 'middle',
          },
        });

        nodeMap.set(el.id, {
          shapeId,
          center: { x: el.x + el.width / 2, y: el.y + el.height / 2 },
          width: el.width,
          height: el.height,
        });
      });

      // Create arrows
      edges.forEach((edge: any) => {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);

        if (from && to) {
          const start = from.center;
          const end = to.center;
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const gap = 12;

          let realStart = start;
          let realEnd = end;

          if (Math.abs(dy) >= Math.abs(dx)) {
            const startOffset = (from.height / 2) + gap;
            const endOffset = (to.height / 2) + gap;
            const sign = Math.sign(dy) || 1;
            realStart = { x: start.x, y: start.y + sign * startOffset };
            realEnd = { x: end.x, y: end.y - sign * endOffset };
          } else {
            const startOffset = (from.width / 2) + gap;
            const endOffset = (to.width / 2) + gap;
            const sign = Math.sign(dx) || 1;
            realStart = { x: start.x + sign * startOffset, y: start.y };
            realEnd = { x: end.x - sign * endOffset, y: end.y };
          }

          tldrawEditor.createShape({
            id: createShapeId(),
            type: 'arrow',
            x: realStart.x,
            y: realStart.y,
            props: {
              start: { x: 0, y: 0 },
              end: { x: realEnd.x - realStart.x, y: realEnd.y - realStart.y },
              arrowheadStart: 'none',
              arrowheadEnd: 'arrow',
              color: 'grey',
              size: 'm',
              text: edge.label || '',
              labelPosition: 0.5,
            },
          });
        }
      });
    });

    const toastId = toast.success(`${processedNodes.length} elementos criados pelo assistente`, {
      action: {
        label: 'X',
        onClick: () => toast.dismiss(toastId),
      },
    });
  }, [tldrawEditor]);

  if (!selectedWhiteboardId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <h2 className="text-xl font-semibold mb-4">Quadros Brancos</h2>
        <p className="text-muted-foreground mb-6">Nenhum quadro criado ainda.</p>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Criar Quadro</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Quadro Branco</DialogTitle></DialogHeader>
            <div className="flex gap-2">
              <Input
                placeholder="Nome do quadro"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateWhiteboard()}
              />
              <Button onClick={handleCreateWhiteboard}>Criar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-full">
        {/* Sidebar com lista de quadros */}
        {isBoardsDrawerOpen && (
        <div 
          className="w-56 border-r bg-muted/30 flex flex-col transition-all duration-200 ease-in-out"
        >
          <div className="p-3 border-b flex items-center justify-between min-w-[224px]">
            <span className="font-medium text-sm">Quadros</span>
            <div className="flex items-center gap-1">
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7"><Plus className="h-4 w-4" /></Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Novo Quadro</DialogTitle></DialogHeader>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nome do quadro"
                      value={newBoardName}
                      onChange={(e) => setNewBoardName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateWhiteboard()}
                    />
                    <Button onClick={handleCreateWhiteboard}>Criar</Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7"
                    onClick={() => setIsBoardsDrawerOpen(false)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Minimizar lista de quadros</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-1 min-w-[224px]">
            {whiteboards.map((wb) => (
              <div
                key={wb.id}
                className={`group flex items-center justify-between px-2 py-1.5 rounded cursor-pointer text-sm ${selectedWhiteboardId === wb.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                  }`}
                onClick={() => {
                  if (editingBoardId !== wb.id) {
                    setSelectedWhiteboardId(wb.id);
                    // Abrir drawer quando selecionar um quadro
                    setIsBoardsDrawerOpen(true);
                  }
                }}
              >
                {editingBoardId === wb.id ? (
                  <div className="flex items-center gap-1.5 flex-1" onClick={(e) => e.stopPropagation()}>
                    <Input
                      value={editingBoardName}
                      onChange={(e) => setEditingBoardName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleRenameBoard(wb.id);
                        } else if (e.key === 'Escape') {
                          setEditingBoardId(null);
                          setEditingBoardName('');
                        }
                      }}
                      className="h-7 text-sm"
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleRenameBoard(wb.id)}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        setEditingBoardId(null);
                        setEditingBoardName('');
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 truncate flex-1">
                      {wb.parent_branch_id && <GitBranch className="h-3 w-3 flex-shrink-0" />}
                      <span className="truncate">{wb.branch_name || wb.name}</span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-popover">
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingBoardId(wb.id);
                            setEditingBoardName(wb.branch_name || wb.name);
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-2" /> Renomear
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => deleteWhiteboard(wb.id)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        )}
        
        {/* Botão para expandir drawer quando minimizado */}
        {!isBoardsDrawerOpen && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur-sm border-r border-t border-b rounded-r-md shadow-sm"
                onClick={() => setIsBoardsDrawerOpen(true)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Expandir lista de quadros</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Canvas principal */}
        <div
          ref={canvasContainerRef}
          className="flex-1 relative"
          style={{ position: 'relative', width: '100%', height: '100%' }}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Top-right tools: Branch, Comments, Notifications, Collaborators */}
              <WhiteboardHeader
                whiteboard={whiteboard}
                branches={branches}
                onCreateBranch={async (name) => {
                  if (selectedWhiteboardId) {
                    await createBranch(selectedWhiteboardId, name);
                  }
                }}
                onMergeBranch={async () => {
                  if (selectedWhiteboardId && whiteboard?.parent_branch_id) {
                    await mergeBranch(selectedWhiteboardId, whiteboard.parent_branch_id);
                    setSelectedWhiteboardId(whiteboard.parent_branch_id);
                    fetchWhiteboards();
                  }
                }}
                onSelectBranch={setSelectedWhiteboardId}
                branchLoading={branchLoading}
                collaborators={collaborators}
                userColor={userColor}
                onHome={() => tldrawEditor?.setCamera({ x: 0, y: 0, z: 1 })}
                hasRemoteActivity={hasRemoteActivity}
                editor={tldrawEditor}
              />

              {selectedWhiteboardId && (
                <>
                  <TldrawWhiteboard
                    whiteboardId={selectedWhiteboardId}
                    onEditorReady={(editor) => {
                      setTldrawEditor(editor);
                      handleRemoteActivity();
                    }}
                    onAnalyzeSelection={handleAnalyzeSelection}
                    drawerState={isBoardsDrawerOpen}
                    isEditable={!isBoardsDrawerOpen}
                    onCanvasInteraction={() => {
                      // Quando o usuário interagir com o canvas, minimizar o drawer
                      if (isBoardsDrawerOpen) {
                        setIsBoardsDrawerOpen(false);
                      }
                    }}
                  />
                  
                  {/* Máscara overlay quando drawer está aberto */}
                  {isBoardsDrawerOpen && (
                    <div 
                      className="absolute inset-0 z-[50] bg-background/60 backdrop-blur-sm cursor-pointer"
                      onClick={() => setIsBoardsDrawerOpen(false)}
                      style={{ pointerEvents: 'auto' }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-background/90 backdrop-blur-md border rounded-lg px-6 py-4 shadow-lg pointer-events-none">
                          <p className="text-sm text-muted-foreground">
                            Clique no canvas para começar a editar
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {saving && (
                <div className="absolute bottom-4 right-4 bg-background/80 px-3 py-1.5 rounded-full text-xs flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                </div>
              )}

              {/* Coordinate Display */}
              <div className="absolute top-4 right-4 z-10 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md text-xs font-mono text-muted-foreground border shadow-sm pointer-events-none select-none">
                X: {Math.round(cursorPosition.x)}, Y: {Math.round(cursorPosition.y)}
              </div>
            </>
          )}
        </div>

        <BearCursor
          containerRef={canvasContainerRef}
          isActive={!isAssistantOpen}
          onClick={() => setIsAssistantOpen(true)}
          activeTool={activeTool}
        />

        <BearAssistant
          isOpen={isAssistantOpen}
          onClose={() => setIsAssistantOpen(false)}
          onCreateElements={handleCreateElementsFromAI}
          activeTool={activeTool}
          whiteboardId={selectedWhiteboardId ?? undefined}
          analysisRequest={assistantAnalysisRequest ?? undefined}
          onAnalysisHandled={(id) =>
            setAssistantAnalysisRequest((prev) => (prev?.id === id ? null : prev))
          }
        />
      </div>
    </TooltipProvider>
  );
}
