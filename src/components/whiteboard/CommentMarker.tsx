import { MessageCircle } from "lucide-react";

interface CommentMarkerProps {
  x: number;
  y: number;
  count: number;
  resolved?: boolean;
  onClick: () => void;
}

export function CommentMarker({ x, y, count, resolved, onClick }: CommentMarkerProps) {
  return (
    <button
      className={`absolute flex items-center justify-center w-6 h-6 rounded-full shadow-lg transition-transform hover:scale-110 ${
        resolved 
          ? 'bg-muted text-muted-foreground' 
          : 'bg-primary text-primary-foreground'
      }`}
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {count > 1 ? (
        <span className="text-xs font-bold">{count}</span>
      ) : (
        <MessageCircle className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
