import { useState, useCallback, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, MoreVertical, Trash2, Loader2, MessageCircle, GitBranch, ChevronLeft, ChevronRight, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useSidebar } from "@/components/ui/sidebar";
import { TldrawWhiteboard } from "@/components/whiteboard/TldrawWhiteboard";
//import { WhiteboardToolbar } from "@/components/whiteboard/WhiteboardToolbar";
import { WhiteboardHeader } from "@/components/whiteboard/WhiteboardHeader";
import { CommentMarker } from "@/components/whiteboard/CommentMarker";
import { CommentThread } from "@/components/whiteboard/CommentThread";
import { BearAssistant } from "@/components/whiteboard/BearAssistant";
import { BearCursor } from "@/components/whiteboard/BearCursor";
import { ToolType } from "@/components/whiteboard/types";
import { Editor, createShapeId } from "tldraw";
import { useWhiteboard } from "@/hooks/useWhiteboard";
import { useWhiteboardPresence } from "@/hooks/useWhiteboardPresence";
import { useWhiteboardBranches } from "@/hooks/useWhiteboardBranches";
import { useWhiteboardComments } from "@/hooks/useWhiteboardComments";
import { useMentions } from "@/hooks/useMentions";
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
  const [activeCommentPosition, setActiveCommentPosition] = useState<{ x: number, y: number } | null>(null);
  const [commentMode, setCommentMode] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
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
    saveSnapshot,
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
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle();

      if (error) throw error;
      return data;
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

  // Comments
  const {
    comments,
    createComment,
    deleteComment,
    toggleResolved,
    getCommentsForObject,
  } = useWhiteboardComments({
    whiteboardId: selectedWhiteboardId,
    enabled: !!selectedWhiteboardId && !loading,
  });

  // Notifications/Mentions
  const { mentions, unreadCount, markAsRead, markAllAsRead } = useMentions();

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

    // Assign positions
    const levelGroups: any[][] = Array(maxLevel + 1).fill(null).map(() => []);
    processedNodes.forEach((n: any) => {
      const level = levels.get(n.id) ?? 0;
      levelGroups[level].push(n);
    });

    let startX = 100;
    let startY = 100;
    const X_GAP = 250;
    const Y_GAP = 50;

    levelGroups.forEach((group, colIndex) => {
      let currentY = startY;
      group.forEach((node) => {
        node.x = startX + (colIndex * X_GAP);
        node.y = currentY;
        currentY += node.height + Y_GAP;
      });
    });

    // Create tldraw shapes
    tldrawEditor.batch(() => {
      processedNodes.forEach((el: any) => {
        const shapeId = createShapeId();
        const fillColor = el.type === 'postit' 
          ? (el.color === 'yellow' ? '#fef08a' : el.color === 'blue' ? '#93c5fd' : el.color === 'green' ? '#86efac' : el.color === 'pink' ? '#f9a8d4' : '#fef08a')
          : '#334155';
        const strokeColor = el.type === 'postit' ? '#eab308' : '#94a3b8';

        if (el.type === 'diamond') {
          // Diamond shape (rotated rectangle)
          const size = Math.max(el.width, el.height) + 40;
          tldrawEditor.createShape({
            id: shapeId,
            type: 'geo',
            x: el.x,
            y: el.y,
            props: {
              w: size,
              h: size,
              geo: 'diamond',
              fill: 'solid',
              color: 'grey',
              dash: 'draw',
              size: 'm',
            },
          });
        } else {
          // Rectangle shape
          tldrawEditor.createShape({
            id: shapeId,
            type: 'geo',
            x: el.x,
            y: el.y,
            props: {
              w: el.width,
              h: el.height,
              geo: 'rectangle',
              fill: 'solid',
              color: 'grey',
              dash: 'draw',
              size: 'm',
            },
          });
        }

        // Add text as separate text shape
        if (el.text || el.content) {
          const textId = createShapeId();
          tldrawEditor.createShape({
            id: textId,
            type: 'text',
            x: el.x,
            y: el.y,
            props: {
              text: el.text || el.content || 'Texto',
              w: el.width - 20,
              h: el.height - 20,
              color: el.type === 'postit' ? 'black' : 'white',
              size: 'm',
              font: 'draw',
              align: 'middle',
              autoSize: false,
            },
          });
        }

        nodeMap.set(el.id, { shapeId, center: { x: el.x + el.width / 2, y: el.y + el.height / 2 } });
      });

      // Create arrows
      edges.forEach((edge: any) => {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);

        if (from && to) {
          const start = from.center;
          const end = to.center;
          const angle = Math.atan2(end.y - start.y, end.x - start.x);
          const gap = 10;
          const startOffset = 50 + gap;
          const endOffset = 50 + gap;

          const realStart = {
            x: start.x + Math.cos(angle) * startOffset,
            y: start.y + Math.sin(angle) * startOffset
          };

          const realEnd = {
            x: end.x - Math.cos(angle) * endOffset,
            y: end.y - Math.sin(angle) * endOffset
          };

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
            },
          });
        }
      });
    });

    toast.success(`${processedNodes.length} elementos criados pelo assistente`);
  }, [tldrawEditor]);

  // Group comments by position (for markers)
  const commentMarkers = comments
    .filter(c => c.position_x !== null && c.position_y !== null && !c.parent_comment_id)
    .reduce((acc, comment) => {
      const key = `${Math.round(comment.position_x! / 20)}-${Math.round(comment.position_y! / 20)}`;
      if (!acc[key]) {
        acc[key] = { x: comment.position_x!, y: comment.position_y!, comments: [], resolved: true };
      }
      acc[key].comments.push(comment);
      if (!comment.resolved) acc[key].resolved = false;
      return acc;
    }, {} as Record<string, { x: number; y: number; comments: typeof comments; resolved: boolean }>);

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
                selectedWhiteboardId={selectedWhiteboardId}
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
                commentMode={commentMode}
                setCommentMode={setCommentMode}
                mentions={mentions}
                unreadCount={unreadCount}
                markAsRead={markAsRead}
                markAllAsRead={markAllAsRead}
                onNavigateToComment={(whiteboardId) => {
                  const wb = whiteboards.find(w => w.id === whiteboardId);
                  if (wb) {
                    setSelectedWhiteboardId(whiteboardId);
                  }
                }}
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
                    commentMode={commentMode}
                    onCanvasClick={(point) => {
                      setActiveCommentPosition(point);
                      setCommentMode(false);
                    }}
                    onEditorReady={(editor) => {
                      setTldrawEditor(editor);
                      handleRemoteActivity();
                    }}
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

              {/* Comment markers on canvas */}
              {tldrawEditor && Object.entries(commentMarkers).map(([key, marker]) => {
                const screenPoint = tldrawEditor.pageToScreen({ x: marker.x, y: marker.y });
                return (
                  <CommentMarker
                    key={key}
                    x={screenPoint.x}
                    y={screenPoint.y}
                    count={marker.comments.length}
                    resolved={marker.resolved}
                    onClick={() => setActiveCommentPosition({ x: marker.x, y: marker.y })}
                  />
                );
              })}

              {/* Active comment thread */}
              {activeCommentPosition && tldrawEditor && canvasContainerRef.current && (
                <div
                  className="absolute z-20"
                  style={{
                    left: Math.min(
                      tldrawEditor.pageToScreen({ x: activeCommentPosition.x, y: activeCommentPosition.y }).x + 20,
                      (canvasContainerRef.current?.getBoundingClientRect().width || window.innerWidth) - 340
                    ),
                    top: Math.min(
                      tldrawEditor.pageToScreen({ x: activeCommentPosition.x, y: activeCommentPosition.y }).y,
                      (canvasContainerRef.current?.getBoundingClientRect().height || window.innerHeight) - 450
                    ),
                    pointerEvents: 'auto',
                  }}
                  onPointerDown={(e) => {
                    // Permitir interação com o CommentThread
                    e.stopPropagation();
                  }}
                >
                  <CommentThread
                    comments={comments.filter(c => {
                      if (c.position_x === null || c.position_y === null) return false;
                      const dx = Math.abs(c.position_x - activeCommentPosition.x);
                      const dy = Math.abs(c.position_y - activeCommentPosition.y);
                      return dx < 30 && dy < 30;
                    })}
                    onClose={() => setActiveCommentPosition(null)}
                    onAddComment={async (content, parentId) => {
                      await createComment(
                        content,
                        undefined,
                        activeCommentPosition.x,
                        activeCommentPosition.y,
                        parentId
                      );
                    }}
                    onDeleteComment={deleteComment}
                    onResolve={toggleResolved}
                    currentUserId={currentUserId}
                    projectId={projectId}
                  />
                </div>
              )}




              {saving && (
                <div className="absolute bottom-4 right-4 bg-background/80 px-3 py-1.5 rounded-full text-xs flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                </div>
              )}

              {commentMode && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm">
                  Clique no canvas para adicionar um comentário
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
          isActive={!isAssistantOpen && !commentMode}
          onClick={() => setIsAssistantOpen(true)}
          activeTool={activeTool}
        />

        <BearAssistant
          isOpen={isAssistantOpen}
          onClose={() => setIsAssistantOpen(false)}
          onCreateElements={handleCreateElementsFromAI}
          activeTool={activeTool}
        />
      </div>
    </TooltipProvider>
  );
}
