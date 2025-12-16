import { Collaborator } from "@/hooks/useWhiteboardPresence";

interface CollaboratorCursorsProps {
  collaborators: Collaborator[];
  canvasOffset: { x: number; y: number };
  zoom: number;
}

export function CollaboratorCursors({ 
  collaborators, 
  canvasOffset, 
  zoom 
}: CollaboratorCursorsProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {collaborators.map((collab) => {
        if (collab.cursorX === null || collab.cursorY === null) return null;

        // Transform canvas coordinates to screen coordinates
        const screenX = (collab.cursorX * zoom) + canvasOffset.x;
        const screenY = (collab.cursorY * zoom) + canvasOffset.y;

        return (
          <div
            key={collab.id}
            className="absolute transition-all duration-75 ease-out"
            style={{
              left: screenX,
              top: screenY,
              transform: 'translate(-2px, -2px)',
            }}
          >
            {/* Cursor SVG */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
            >
              <path
                d="M5.5 3L19 12L12 13.5L9 20L5.5 3Z"
                fill={collab.color}
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            
            {/* Name label */}
            <div
              className="absolute left-4 top-4 px-2 py-0.5 rounded text-xs font-medium text-white whitespace-nowrap"
              style={{ 
                backgroundColor: collab.color,
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }}
            >
              {collab.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
