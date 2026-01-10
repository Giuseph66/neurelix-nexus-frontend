import { BearState, BearEvent, BearCoreConfig, Suggestion } from "./types";
import { SkillManager } from "./SkillManager";

type Listener = (state: BearState) => void;
type SuggestionListener = (suggestion: Suggestion | null) => void;

export class BearCore {
    private static instance: BearCore;

    public state: BearState = {
        position: { x: window.innerWidth - 100, y: window.innerHeight - 100 },
        pointerPosition: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        expression: 'neutral',
        isVisible: true,
        activeSkillId: null,
        debugMode: false
    };

    public currentSuggestion: Suggestion | null = null;

    private listeners: Set<Listener> = new Set();
    private suggestionListeners: Set<SuggestionListener> = new Set();
    private skillManager: SkillManager;
    private rafId: number | null = null;
    private lastTime: number = 0;

    private constructor(config?: BearCoreConfig) {
        this.state.debugMode = config?.debug || false;
        this.skillManager = new SkillManager(this);
        this.startLoop();
    }

    static getInstance(config?: BearCoreConfig): BearCore {
        if (!BearCore.instance) {
            BearCore.instance = new BearCore(config);
        }
        return BearCore.instance;
    }

    // --- State Management ---

    subscribe(listener: Listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    subscribeToSuggestions(listener: SuggestionListener) {
        this.suggestionListeners.add(listener);
        return () => this.suggestionListeners.delete(listener);
    }

    setState(partial: Partial<BearState>) {
        const newState = { ...this.state, ...partial };

        // Simple shallow comparison to avoid unnecessary notifies
        const hasChanged = Object.keys(partial).some(
            key => (partial as any)[key] !== (this.state as any)[key]
        );

        if (hasChanged) {
            this.state = newState;
            this.notify();
        }
    }

    setSuggestion(suggestion: Suggestion | null) {
        this.currentSuggestion = suggestion;
        this.notifySuggestions();
    }

    private notify() {
        this.listeners.forEach(l => l(this.state));
    }

    private notifySuggestions() {
        this.suggestionListeners.forEach(l => l(this.currentSuggestion));
    }

    // --- Event Bus ---

    dispatch(event: BearEvent) {
        this.skillManager.handleEvent(event);
    }

    // --- Game Loop ---

    private startLoop() {
        this.lastTime = performance.now();
        const loop = (time: number) => {
            const deltaTime = time - this.lastTime;
            this.lastTime = time;

            this.skillManager.update(deltaTime);

            this.rafId = requestAnimationFrame(loop);
        };
        this.rafId = requestAnimationFrame(loop);
    }

    // --- Public API for Skills ---

    get skillRegistry() {
        return this.skillManager;
    }

    dispose() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
        this.skillManager.dispose();
        this.listeners.clear();
        this.suggestionListeners.clear();
    }
}
