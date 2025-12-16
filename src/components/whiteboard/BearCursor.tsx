import { useEffect, useState, useCallback, useRef } from "react";

interface BearCursorProps {
  containerRef: React.RefObject<HTMLDivElement>;
  isActive: boolean;
  onClick?: () => void;
}

export function BearCursor({ containerRef, isActive, onClick }: BearCursorProps) {
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
  const faceRef = useRef<SVGSVGElement>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!faceRef.current) return;
    
    const rect = faceRef.current.getBoundingClientRect();
    const faceCenterX = rect.left + rect.width / 2;
    const faceCenterY = rect.top + rect.height / 2;
    
    // Calculate angle and distance from face center to mouse
    const dx = e.clientX - faceCenterX;
    const dy = e.clientY - faceCenterY;
    
    // Limit eye movement radius
    const maxOffset = 3;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const normalizedDistance = Math.min(distance / 200, 1);
    
    const offsetX = (dx / (distance || 1)) * maxOffset * normalizedDistance;
    const offsetY = (dy / (distance || 1)) * maxOffset * normalizedDistance;
    
    setEyeOffset({ x: offsetX, y: offsetY });
  }, []);

  useEffect(() => {
    if (!isActive) return;
    
    window.addEventListener("mousemove", handleMouseMove);
    
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isActive, handleMouseMove]);

  if (!isActive) return null;

  return (
    <div className="absolute bottom-6 right-6 z-40 group">
      <svg
        ref={faceRef}
        width="48"
        height="48"
        viewBox="0 0 100 100"
        className="cursor-pointer hover:scale-110 transition-transform drop-shadow-md"
        onClick={onClick}
      >
        {/* Face circle */}
        <circle 
          cx="50" 
          cy="50" 
          r="46" 
          fill="hsl(var(--background))" 
          stroke="hsl(var(--foreground))" 
          strokeWidth="4"
        />
        
        {/* Left eyebrow - raised */}
        <path
          d="M 28 32 Q 35 28 42 32"
          stroke="hsl(var(--foreground))"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        
        {/* Right eyebrow - angled/skeptical */}
        <path
          d="M 58 34 L 72 28"
          stroke="hsl(var(--foreground))"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        
        {/* Left eye */}
        <ellipse 
          cx={35 + eyeOffset.x} 
          cy={45 + eyeOffset.y} 
          rx="4" 
          ry="5" 
          fill="hsl(var(--foreground))"
        />
        
        {/* Right eye */}
        <ellipse 
          cx={65 + eyeOffset.x} 
          cy={45 + eyeOffset.y} 
          rx="4" 
          ry="5" 
          fill="hsl(var(--foreground))"
        />
        
        {/* Mouth - straight line */}
        <line
          x1="35"
          y1="70"
          x2="65"
          y2="70"
          stroke="hsl(var(--foreground))"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      
      {/* Tooltip on hover */}
      <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-popover border rounded px-2 py-1 text-xs whitespace-nowrap shadow-sm transition-opacity pointer-events-none">
        Assistente IA
      </div>
    </div>
  );
}
