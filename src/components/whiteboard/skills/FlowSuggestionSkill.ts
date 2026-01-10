import { Skill, BearEvent, Suggestion, GhostElement } from "../bear-core/types";
import { BearCore } from "../bear-core/BearCore";

export class FlowSuggestionSkill implements Skill {
    id = "flow-suggestion";
    name = "Flow Suggestion";
    priority = 40;

    private core!: BearCore;

    init(core: any) {
        this.core = core;
    }

    dispose() { }

    onEvent(event: BearEvent): boolean {
        if (event.type === 'selection') {
            const { selection } = event.payload;
            this.analyzeSelection(selection);
            return false;
        }
        return false;
    }

    update(deltaTime: number) { }

    private analyzeSelection(selection: any[]) {
        if (!selection || selection.length !== 1) {
            // Only suggest for single selection for now
            if (this.core.currentSuggestion?.type === 'flow-next-step') {
                this.core.setSuggestion(null);
            }
            return;
        }

        const item = selection[0];
        // Check if it's a shape that usually has flow (rect, diamond, circle)
        if (['rectangle', 'diamond', 'circle'].includes(item.type)) {
            this.suggestNextStep(item);
        }
    }

    private suggestNextStep(sourceItem: any) {
        // Logic to determine where to place the ghost shape
        // For simplicity, place it to the right
        const gap = 100;
        const ghostX = sourceItem.x + sourceItem.width + gap;
        const ghostY = sourceItem.y;

        const ghostShape: GhostElement = {
            id: `ghost-${Date.now()}`,
            type: 'shape',
            x: ghostX,
            y: ghostY,
            width: sourceItem.width,
            height: sourceItem.height,
            props: { type: sourceItem.type, label: "Next Step?" } // Suggest same shape
        };

        const ghostArrow: GhostElement = {
            id: `ghost-arrow-${Date.now()}`,
            type: 'arrow',
            x: sourceItem.x + sourceItem.width,
            y: sourceItem.y + sourceItem.height / 2,
            // Arrow logic would be more complex in real implementation
            content: "-->"
        };

        const suggestion: Suggestion = {
            id: `flow-${Date.now()}`,
            type: 'flow-next-step',
            content: [ghostShape, ghostArrow],
            onAccept: () => {
                this.core.dispatch({
                    type: 'lifecycle',
                    payload: {
                        action: 'create_elements',
                        elements: [ghostShape, ghostArrow] // Real implementation would convert ghost to real
                    }
                });
                this.core.setSuggestion(null);
                this.core.setState({ expression: 'happy' });
            },
            onReject: () => {
                this.core.setSuggestion(null);
            }
        };

        this.core.setSuggestion(suggestion);
        this.core.setState({ expression: 'thinking' });
    }
}
