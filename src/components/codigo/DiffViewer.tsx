import { useState, useMemo, useEffect, Fragment } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, FileText, ChevronRight, ChevronDown, Folder, FolderOpen, Image as ImageIcon, Film, FileType, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { CommentThread } from './CommentThread';
import type { PRComment } from '@/types/codigo';

interface DiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  raw_url?: string;
}

interface FileTreeNode {
  name: string;
  path: string;
  file?: DiffFile;
  children: Record<string, FileTreeNode>;
  isFolder: boolean;
  totalComments: number;
}

interface DiffViewerProps {
  files: DiffFile[];
  comments?: PRComment[];
  onLineClick?: (file: string, line: number, side: 'old' | 'new') => void;
  selectedFile?: string;
  onFileSelect?: (filename: string) => void;
  onReplyComment?: (
    threadId: string,
    body: string,
    context?: { path?: string; line_number?: number; side?: 'LEFT' | 'RIGHT' }
  ) => Promise<void>;
  onResolveThread?: (threadId: string, resolution: 'RESOLVED' | 'WONT_FIX', reason?: string) => Promise<void>;
  onReaction?: (commentId: string, reaction: 'like' | 'dislike' | 'contra', reason?: string) => Promise<void>;
  canResolveThreads?: boolean;
  draftLine?: { file: string; line: number; side: 'old' | 'new' } | null;
}

interface DiffLine {
  type: 'context' | 'added' | 'removed' | 'header';
  oldLine?: number;
  newLine?: number;
  content: string;
}

export function DiffViewer({
  files,
  comments = [],
  onLineClick,
  selectedFile,
  onFileSelect,
  onReplyComment,
  onResolveThread,
  onReaction,
  canResolveThreads = false,
  draftLine
}: DiffViewerProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['']));

  const commentCountByFile = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of comments || []) {
      if (!c?.path) continue;
      counts.set(c.path, (counts.get(c.path) || 0) + 1);
    }
    return counts;
  }, [comments]);

  const fileComments = useMemo(() => {
    if (!selectedFile || !comments) return {};

    // Group comments by line number
    const grouped: Record<number, PRComment[]> = {};

    comments.forEach(comment => {
      if (comment.path === selectedFile && comment.line_number) {
        if (!grouped[comment.line_number]) {
          grouped[comment.line_number] = [];
        }
        grouped[comment.line_number].push(comment);
      }
    });

    return grouped;
  }, [selectedFile, comments]);

  // Build tree from flat files
  const fileTree = useMemo(() => {
    const root: FileTreeNode = { name: '', path: '', children: {}, isFolder: true, totalComments: 0 };
    
    files.forEach(file => {
      const parts = file.filename.split('/');
      let current = root;
      let currentPath = '';

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = index === parts.length - 1;

        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: currentPath,
            children: {},
            isFolder: !isLast,
            file: isLast ? file : undefined,
            totalComments: 0
          };
        }
        current = current.children[part];
      });
    });

    // Recursively calculate comment counts for folders
    const calculateFolderComments = (node: FileTreeNode): number => {
      let count = 0;
      if (!node.isFolder) {
        count = commentCountByFile.get(node.path) || 0;
      } else {
        Object.values(node.children).forEach(child => {
          count += calculateFolderComments(child);
        });
      }
      node.totalComments = count;
      return count;
    };

    calculateFolderComments(root);

    return root;
  }, [files, commentCountByFile]);

  // Auto-expand folders leading to selected file
  useEffect(() => {
    if (selectedFile) {
      const parts = selectedFile.split('/');
      const toExpand = new Set(expandedNodes);
      let currentPath = '';
      
      // Expand all parent folders
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        toExpand.add(currentPath);
      }
      
      if (toExpand.size !== expandedNodes.size) {
        setExpandedNodes(toExpand);
      }
    }
  }, [selectedFile]);

  // Auto-select first file if none selected
  useEffect(() => {
    if (!selectedFile && files.length > 0 && onFileSelect) {
      onFileSelect(files[0].filename);
    }
  }, [selectedFile, files, onFileSelect]);

  const parsedFile = useMemo(() => {
    const file = files.find(f => f.filename === selectedFile);
    if (!file) return null;

    // Check for media types
    const extension = file.filename.split('.').pop()?.toLowerCase();
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(extension || '');
    const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(extension || '');
    const isPdf = ['pdf'].includes(extension || '');

    if (isImage || isVideo || isPdf) {
      return { ...file, lines: [], isMedia: true, mediaType: isImage ? 'image' : isVideo ? 'video' : 'pdf' };
    }

    if (!file.patch) return { ...file, lines: [], isMedia: false };

    const lines: DiffLine[] = [];
    const patchLines = file.patch.split('\n');
    let oldLineNum = 0;
    let newLineNum = 0;
    let inHunk = false;

    for (const line of patchLines) {
      if (line.startsWith('@@')) {
        // Hunk header
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldLineNum = parseInt(match[1]) - 1;
          newLineNum = parseInt(match[2]) - 1;
          inHunk = true;
          lines.push({ type: 'header', content: line });
        }
      } else if (inHunk) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          newLineNum++;
          lines.push({
            type: 'added',
            oldLine: undefined,
            newLine: newLineNum,
            content: line.substring(1),
          });
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          oldLineNum++;
          lines.push({
            type: 'removed',
            oldLine: oldLineNum,
            newLine: undefined,
            content: line.substring(1),
          });
        } else if (line.startsWith(' ')) {
          oldLineNum++;
          newLineNum++;
          lines.push({
            type: 'context',
            oldLine: oldLineNum,
            newLine: newLineNum,
            content: line.substring(1),
          });
        } else {
          lines.push({ type: 'context', content: line });
        }
      } else {
        lines.push({ type: 'context', content: line });
      }
    }

    return { ...file, lines, isMedia: false };
  }, [files, selectedFile]);

  const handleLineClick = (file: string, line: DiffLine, side: 'old' | 'new') => {
    if (onLineClick && (line.oldLine || line.newLine)) {
      const lineNum = side === 'old' ? line.oldLine : line.newLine;
      if (lineNum) {
        onLineClick(file, lineNum, side);
      }
    }
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) return <ImageIcon className="h-4 w-4" />;
    if (['mp4', 'webm', 'ogg', 'mov'].includes(ext || '')) return <Film className="h-4 w-4" />;
    if (ext === 'pdf') return <FileType className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const toggleNode = (path: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedNodes(newExpanded);
  };

  const renderTree = (node: FileTreeNode, level: number = 0) => {
    const sortedChildren = Object.values(node.children).sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });

    return (
      <div key={node.path || 'root'}>
        {node.path && (
          <button
            onClick={() => node.isFolder ? toggleNode(node.path) : onFileSelect?.(node.path)}
            className={cn(
              "w-full min-w-0 flex items-center gap-2 px-2 py-1 text-sm transition-colors text-left group hover:bg-muted/50",
              !node.isFolder && selectedFile === node.path
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground",
              node.isFolder ? "font-medium" : "font-mono text-xs"
            )}
            style={{ paddingLeft: `${(level + 1) * 12}px` }}
          >
            <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
              {node.isFolder ? (
                expandedNodes.has(node.path) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
              ) : (
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  node.file?.status === 'added' && "bg-green-500",
                  node.file?.status === 'removed' && "bg-red-500",
                  node.file?.status === 'modified' && "bg-yellow-500"
                )} />
              )}
            </div>
            
            <div className="flex-shrink-0 text-muted-foreground/70">
              {node.isFolder ? (
                expandedNodes.has(node.path) ? <FolderOpen className="h-4 w-4 text-amber-500/80" /> : <Folder className="h-4 w-4 text-amber-500/80" />
              ) : (
                getFileIcon(node.name)
              )}
            </div>

            <span className="flex-1 min-w-0 truncate" title={node.name}>
              {node.name}
            </span>

            {node.totalComments > 0 && (!node.isFolder || !expandedNodes.has(node.path)) && (
              <Badge 
                variant={!node.isFolder && selectedFile === node.path ? 'default' : 'secondary'} 
                className={cn(
                  "flex-shrink-0 text-[10px] px-1 py-0 h-4 gap-1",
                  node.isFolder && "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200"
                )}
              >
                <MessageSquare className="h-2.5 w-2.5" />
                {node.totalComments}
              </Badge>
            )}

            {!node.isFolder && node.file && (
              <>
                {(node.file.additions > 0 || node.file.deletions > 0) && (
                  <div className="flex-shrink-0 flex items-center gap-1 text-[10px] opacity-70">
                    {node.file.additions > 0 && <span className="text-green-600">+{node.file.additions}</span>}
                    {node.file.deletions > 0 && <span className="text-red-600">-{node.file.deletions}</span>}
                  </div>
                )}
              </>
            )}
          </button>
        )}
        {(expandedNodes.has(node.path) || !node.path) && sortedChildren.length > 0 && (
          <div className="flex flex-col">
            {sortedChildren.map(child => renderTree(child, level + (node.path ? 1 : 0)))}
          </div>
        )}
      </div>
    );
  };

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <div className="h-full border rounded-md overflow-hidden bg-background">
      <ResizablePanelGroup direction="horizontal" className="min-w-0">
        {/* Sidebar - File List */}
        <ResizablePanel defaultSize={20} minSize={12} maxSize={30} className="border-r bg-muted/10 min-w-0 overflow-hidden">
          <div className="flex flex-col h-full">
            <div className="p-3 border-b bg-muted/20">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Arquivos ({files.length})
                </h3>
                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="text-green-600">+{totalAdditions}</span>
                  <span className="text-red-600">-{totalDeletions}</span>
                </div>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="py-2">
                {renderTree(fileTree)}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Main Content - Diff View */}
        <ResizablePanel defaultSize={75}>
          <div className="h-full flex flex-col bg-background">
            {selectedFile && parsedFile ? (
              <>
                <div className="p-3 border-b bg-muted/10 flex items-center justify-between sticky top-0 z-10">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium">{selectedFile}</span>
                    <div className="flex gap-1">
                      {parsedFile.status === 'added' && <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Added</Badge>}
                      {parsedFile.status === 'removed' && <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">Deleted</Badge>}
                      {parsedFile.status === 'modified' && <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50">Modified</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center text-green-600"><Plus className="h-3 w-3 mr-0.5" />{parsedFile.additions}</span>
                    <span className="flex items-center text-red-600"><Minus className="h-3 w-3 mr-0.5" />{parsedFile.deletions}</span>
                  </div>
                </div>

                <ScrollArea className="flex-1">
                  {parsedFile.isMedia && parsedFile.raw_url ? (
                    <div className="flex flex-col items-center justify-center p-8 min-h-[300px]">
                      {(parsedFile as any).mediaType === 'image' && (
                        <div className="max-w-full overflow-hidden rounded-lg border shadow-sm">
                          <img src={parsedFile.raw_url} alt={parsedFile.filename} className="max-w-full h-auto" />
                        </div>
                      )}
                      {(parsedFile as any).mediaType === 'video' && (
                        <div className="max-w-full overflow-hidden rounded-lg border shadow-sm">
                          <video src={parsedFile.raw_url} controls className="max-w-full max-h-[600px]" />
                        </div>
                      )}
                      {(parsedFile as any).mediaType === 'pdf' && (
                        <div className="w-full h-[800px] rounded-lg border shadow-sm overflow-hidden">
                          <iframe src={parsedFile.raw_url} className="w-full h-full" title={parsedFile.filename} />
                        </div>
                      )}
                      <div className="mt-4 text-sm text-muted-foreground flex items-center gap-2">
                        <a href={parsedFile.raw_url} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">
                          Abrir original em nova aba
                          <ChevronRight className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  ) : parsedFile.lines && parsedFile.lines.length > 0 ? (
                    <div className="w-full">
                      <table className="w-full table-fixed border-collapse text-sm font-mono">
                        <colgroup>
                          <col className="w-[50px]" />
                          <col className="w-[50px]" />
                          <col />
                        </colgroup>
                        <tbody>
                          {parsedFile.lines.map((line, idx) => {
                            const lineNum = line.newLine || line.oldLine;
                            const side = line.newLine ? 'new' : 'old';
                            const isClickable = (line.type === 'added' || line.type === 'removed' || line.type === 'context') && lineNum;
                            const commentsForLine = lineNum ? fileComments[lineNum] : undefined;

                            return (
                              <Fragment key={idx}>
                                <tr
                                  className={cn(
                                    "group hover:bg-muted/30 transition-colors",
                                    line.type === 'added' && "bg-green-500/10 hover:bg-green-500/20",
                                    line.type === 'removed' && "bg-red-500/10 hover:bg-red-500/20",
                                    line.type === 'header' && "bg-muted/30 text-muted-foreground"
                                  )}
                                >
                                  {/* Old Line Number */}
                                  <td className="w-[50px] text-right px-2 py-0.5 select-none border-r text-xs text-muted-foreground/50 bg-muted/5">
                                    {line.type !== 'added' && line.type !== 'header' ? line.oldLine : ''}
                                  </td>

                                  {/* New Line Number */}
                                  <td className="w-[50px] text-right px-2 py-0.5 select-none border-r text-xs text-muted-foreground/50 bg-muted/5">
                                    {line.type !== 'removed' && line.type !== 'header' ? line.newLine : ''}
                                  </td>

                                  {/* Content */}
                                  <td
                                    className={cn(
                                      "px-4 py-0.5 whitespace-pre-wrap break-all overflow-hidden",
                                      line.type === 'added' && "text-green-700 dark:text-green-400",
                                      line.type === 'removed' && "text-red-700 dark:text-red-400",
                                      line.type === 'header' && "text-blue-600 dark:text-blue-400 font-medium",
                                      isClickable && "cursor-pointer"
                                    )}
                                    onClick={() => isClickable && handleLineClick(selectedFile, line, side)}
                                  >
                                    <span className="select-none mr-2 opacity-50 w-3 inline-block text-center">
                                      {line.type === 'added' && '+'}
                                      {line.type === 'removed' && '-'}
                                    </span>
                                    {line.content}
                                  </td>
                                </tr>
                                {/* Inline Comments */}
                                {commentsForLine && commentsForLine.length > 0 && (
                                  (() => {
                                    const displayedComments = commentsForLine.filter(comment => {
                                      const commentSide = comment.side === 'LEFT' ? 'old' : 'new';
                                      return commentSide === side;
                                    });

                                    if (displayedComments.length === 0) return null;

                                    return (
                                      <tr>
                                        <td colSpan={3} className="px-0 py-0 border-b">
                                          <CommentThread
                                            comments={displayedComments}
                                            onReply={async (body) => {
                                              if (onReplyComment && displayedComments[0].id) {
                                        const first = displayedComments[0] as any;
                                        const threadId = (first.thread_id as string | undefined) || first.id;
                                        await onReplyComment(threadId, body, {
                                          path: first.path,
                                          line_number: first.line_number,
                                          side: first.side,
                                        });
                                              }
                                            }}
                                            onResolve={onResolveThread ? async (resolution, reason) => {
                                              if (displayedComments[0].id) {
                                        const first = displayedComments[0] as any;
                                        const threadId = (first.thread_id as string | undefined) || first.id;
                                        await onResolveThread(threadId, resolution, reason);
                                              }
                                            } : undefined}
                                            onReaction={onReaction}
                                    canResolve={canResolveThreads}
                                          />
                                        </td>
                                      </tr>
                                    );
                                  })()
                                )}
                                {/* Draft Comment Form */}
                                {selectedFile && onLineClick && draftLine &&
                                  draftLine.file === selectedFile &&
                                  ((side === 'old' && line.oldLine === draftLine.line && draftLine.side === 'old') ||
                                    (side === 'new' && line.newLine === draftLine.line && draftLine.side === 'new')) && (
                                    <tr>
                                      <td colSpan={3} className="px-0 py-0 border-b">
                                        <CommentThread
                                          comments={[]}
                                          onReply={async (body) => {
                                            if (onReplyComment) {
                                              await onReplyComment('NEW_THREAD', body);
                                            }
                                          }}
                                          isDraft={true}
                                          onCancel={() => onLineClick(selectedFile, 0, side)} // 0 line means cancel
                                        />
                                      </td>
                                    </tr>
                                  )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                      <FileText className="h-8 w-8 mb-2 opacity-20" />
                      <p>
                        {parsedFile.isMedia && !parsedFile.raw_url
                          ? "Preview não disponível (URL não encontrada)"
                          : "No content changes to display"}
                      </p>
                    </div>
                  )}
                </ScrollArea>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <FileText className="h-12 w-12 mb-4 opacity-10" />
                <p>Select a file to view changes</p>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

