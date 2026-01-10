import { useEffect, useRef, useState } from "react";
import { BearFace } from "./BearFace";
import { ToolType } from "./types";
import { BearCore } from "./bear-core/BearCore";
import { BearExpression } from "./bear-core/types";

interface BearCursorProps {
  containerRef: React.RefObject<HTMLDivElement>;
  isActive: boolean;
  onClick?: () => void;
  activeTool?: ToolType;
}

export function BearCursor({ containerRef, isActive, onClick, activeTool = 'select' }: BearCursorProps) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const [expression, setExpression] = useState<BearExpression>('neutral');

  useEffect(() => {
    if (!isActive) return;

    const core = BearCore.getInstance();

    // Subscribe to expression changes
    const unsubscribe = core.subscribe((state) => {
      setExpression(state.expression);
    });

    return () => {
      unsubscribe();
    };
  }, [isActive]);

  // Update core expression based on tool
  useEffect(() => {
    const core = BearCore.getInstance();
    let expr: BearExpression = 'neutral';

    switch (activeTool) {
      case 'pencil':
      case 'line':
      case 'arrow':
        expr = 'focused';
        break;
      case 'eraser':
        expr = 'concerned';
        break;
      case 'rectangle':
      case 'circle':
        expr = 'surprised';
        break;
      case 'text':
      case 'postit':
        expr = 'excited';
        break;
      case 'pan':
        expr = 'happy';
        break;
    }

    // Only update if not in a special state (like thinking/suggesting)
    if (!['thinking', 'suggesting', 'error'].includes(core.state.expression)) {
      core.setState({ expression: expr });
    }
  }, [activeTool]);

  if (!isActive) return null;

  return (
    <div
      ref={cursorRef}
      className="fixed bottom-6 right-6 z-[100] pointer-events-none"
    >
      <div className="relative group pointer-events-auto">
        <BearFace
          expression={expression}
          className="cursor-pointer hover:scale-110 transition-transform drop-shadow-md"
          onClick={onClick}
          size={56}
        />

        {/* Tooltip on hover */}
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-popover border rounded px-2 py-1 text-xs whitespace-nowrap shadow-sm transition-opacity pointer-events-none">
          Assistente IA
        </div>
      </div>
    </div>
  );
}
