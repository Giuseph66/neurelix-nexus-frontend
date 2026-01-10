import { Collaborator } from "@/hooks/useWhiteboardPresence";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface CollaboratorAvatarsProps {
  collaborators: Collaborator[];
  currentUserColor: string;
  hasRemoteActivity?: boolean;
}

export function CollaboratorAvatars({ 
  collaborators, 
  currentUserColor,
  hasRemoteActivity = false,
}: CollaboratorAvatarsProps) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {/* Current user indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div 
              className={`w-3 h-3 rounded-full ring-2 ring-background ${hasRemoteActivity ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: currentUserColor }}
            />
          </TooltipTrigger>
          <TooltipContent>
            <p>Você</p>
          </TooltipContent>
        </Tooltip>

        {/* Other collaborators */}
        {collaborators.map((collab) => (
          <Tooltip key={collab.id}>
            <TooltipTrigger asChild>
              <Avatar className="h-6 w-6 ring-2 ring-background" style={{ borderColor: collab.color }}>
                <AvatarFallback 
                  className="text-[10px] font-medium text-white"
                  style={{ backgroundColor: collab.color }}
                >
                  {collab.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <p>{collab.name}</p>
            </TooltipContent>
          </Tooltip>
        ))}

        {collaborators.length > 0 && (
          <span className="text-xs text-muted-foreground ml-1">
            {collaborators.length + 1} online
          </span>
        )}
      </div>
    </TooltipProvider>
  );
}
