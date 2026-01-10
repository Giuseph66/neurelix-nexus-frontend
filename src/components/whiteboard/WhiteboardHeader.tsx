import { MessageCircle, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BranchMenu } from "@/components/whiteboard/BranchMenu";
import { NotificationBell } from "@/components/whiteboard/NotificationBell";
import { CollaboratorAvatars } from "@/components/whiteboard/CollaboratorAvatars";
import { ExportButton } from "@/components/whiteboard/ExportButton";
import { Editor } from "tldraw";

interface WhiteboardHeaderProps {
    whiteboard: any;
    branches: any[];
    selectedWhiteboardId: string | null;
    onCreateBranch: (name: string) => Promise<void>;
    onMergeBranch: () => Promise<void>;
    onSelectBranch: (id: string) => void;
    branchLoading: boolean;
    commentMode: boolean;
    setCommentMode: (mode: boolean) => void;
    mentions: any[];
    unreadCount: number;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    onNavigateToComment: (whiteboardId: string) => void;
    collaborators: any[];
    userColor: string;
    onHome?: () => void;
    hasRemoteActivity?: boolean;
    editor?: Editor | null;
}

export function WhiteboardHeader({
    whiteboard,
    branches,
    selectedWhiteboardId,
    onCreateBranch,
    onMergeBranch,
    onSelectBranch,
    branchLoading,
    commentMode,
    setCommentMode,
    mentions,
    unreadCount,
    markAsRead,
    markAllAsRead,
    onNavigateToComment,
    collaborators,
    userColor,
    onHome,
    hasRemoteActivity,
    editor,
}: WhiteboardHeaderProps) {
    return (
        <div className="absolute left-1/2 top-4 transform -translate-x-1/2 z-10 flex items-center gap-2 bg-background/95 backdrop-blur-sm border border-border rounded-lg p-1.5 shadow-lg pointer-events-auto">
            <BranchMenu
                currentWhiteboard={whiteboard}
                branches={branches}
                onCreateBranch={onCreateBranch}
                onMergeBranch={onMergeBranch}
                onSelectBranch={onSelectBranch}
                loading={branchLoading}
            />

            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onHome}
                title="Resetar visualização (Home)"
            >
                <Home className="h-4 w-4" />
            </Button>

            <Button
                variant={commentMode ? "default" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setCommentMode(!commentMode)}
            >
                <MessageCircle className="h-4 w-4" />
            </Button>

            <NotificationBell
                notifications={mentions}
                unreadCount={unreadCount}
                onMarkAsRead={markAsRead}
                onMarkAllAsRead={markAllAsRead}
                onNavigateToComment={onNavigateToComment}
            />

            <ExportButton 
                editor={editor || null}
                whiteboardName={whiteboard?.name || whiteboard?.branch_name || 'whiteboard'}
            />

            <div className="w-px h-6 bg-border" />

            <CollaboratorAvatars
                collaborators={collaborators}
                currentUserColor={userColor}
                hasRemoteActivity={hasRemoteActivity}
            />
        </div>
    );
}
