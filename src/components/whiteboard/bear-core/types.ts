
export type BearExpression = 'neutral' | 'happy' | 'focused' | 'surprised' | 'concerned' | 'excited' | 'skeptical' | 'thinking' | 'suggesting' | 'error';

export interface Point {
    x: number;
    y: number;
}

export interface BearState {
    position: Point;
    pointerPosition: Point; // Global pointer position
    expression: BearExpression;
    isVisible: boolean;
    activeSkillId: string | null;
    debugMode: boolean;
}

export interface GhostElement {
    id: string;
    type: 'text' | 'shape' | 'arrow';
    content?: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    props?: any;
}

export interface Suggestion {
    id: string;
    type: 'text-completion' | 'flow-next-step';
    content: string | GhostElement[];
    preview?: string; // For text ghosting
    onAccept: () => void;
    onReject: () => void;
}

export interface BearEvent {
    type: 'pointer' | 'selection' | 'typing' | 'keydown' | 'lifecycle';
    payload: any;
}

export interface Skill {
    id: string;
    name: string;
    priority: number; // Higher is better

    init(core: any): void;
    dispose(): void;

    onEvent(event: BearEvent): boolean; // Return true if handled/consumed
    update(deltaTime: number): void;
}

export interface BearCoreConfig {
    debug?: boolean;
}
