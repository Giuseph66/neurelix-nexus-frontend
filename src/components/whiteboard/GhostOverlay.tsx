import { useEffect, useState } from "react";
import { BearCore } from "./bear-core/BearCore";
import { Suggestion, GhostElement } from "./bear-core/types";
import { cn } from "@/lib/utils";

export function GhostOverlay() {
    const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

    useEffect(() => {
        const core = BearCore.getInstance();
        const unsubscribe = core.subscribeToSuggestions((s) => {
            setSuggestion(s);
        });
        return () => { unsubscribe(); };
    }, []);

    if (!suggestion) return null;

    return (
        <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
            {suggestion.type === 'text-completion' && (
                <GhostTextOverlay content={suggestion.content as string} />
            )}
            {suggestion.type === 'flow-next-step' && (
                <GhostFlowOverlay elements={suggestion.content as GhostElement[]} />
            )}

            {/* Action Buttons */}
            <div
                className="absolute z-50 flex gap-2"
                style={{
                    top: getActionPosition(suggestion).y,
                    left: getActionPosition(suggestion).x
                }}
            >
                <div className="bg-background/90 backdrop-blur border rounded-md shadow-lg p-1 flex gap-1 animate-in fade-in zoom-in duration-200">
                    <span className="text-[10px] text-muted-foreground px-2 py-1 flex items-center">
                        <kbd className="border rounded px-1 mr-1">TAB</kbd> aceitar
                    </span>
                    <span className="text-[10px] text-muted-foreground px-2 py-1 flex items-center border-l">
                        <kbd className="border rounded px-1 mr-1">ESC</kbd> cancelar
                    </span>
                </div>
            </div>
        </div>
    );
}

function getActionPosition(suggestion: Suggestion) {
    // Simple logic to place actions near the suggestion
    // In a real app, this would depend on the cursor or the element position
    const core = BearCore.getInstance();
    const { x, y } = core.state.pointerPosition;
    return { x: x + 20, y: y + 20 };
}

function GhostTextOverlay({ content }: { content: string }) {
    // In a real implementation, this would need to align perfectly with the input
    // For now, we render it near the cursor or as a tooltip-like preview
    const core = BearCore.getInstance();
    const { x, y } = core.state.pointerPosition;

    return (
        <div
            className="absolute text-muted-foreground/50 pointer-events-none whitespace-pre"
            style={{
                left: x + 10, // Offset from cursor
                top: y - 20,
                fontFamily: 'monospace' // Assuming code or similar
            }}
        >
            {content}
        </div>
    );
}

function GhostFlowOverlay({ elements }: { elements: GhostElement[] }) {
    return (
        <>
            {elements.map(el => (
                <div
                    key={el.id}
                    className={cn(
                        "absolute border-2 border-dashed border-primary/50 bg-primary/5 flex items-center justify-center text-primary/50",
                        el.type === 'arrow' && "border-none bg-transparent"
                    )}
                    style={{
                        left: el.x,
                        top: el.y,
                        width: el.width || 100,
                        height: el.height || 100,
                        borderRadius: el.props?.type === 'circle' ? '50%' : '4px',
                        transform: el.props?.type === 'diamond' ? 'rotate(45deg)' : 'none'
                    }}
                >
                    {el.type === 'arrow' ? '→' : (el.props?.label || '')}
                </div>
            ))}
        </>
    );
}
