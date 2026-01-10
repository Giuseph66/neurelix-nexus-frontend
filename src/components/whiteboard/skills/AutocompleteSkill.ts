import { Skill, BearEvent, Suggestion } from "../bear-core/types";
import { BearCore } from "../bear-core/BearCore";

export class AutocompleteSkill implements Skill {
    id = "autocomplete";
    name = "Autocomplete";
    priority = 50;

    private core!: BearCore;
    private debounceTimer: any = null;
    private lastContext: string = "";

    init(core: any) {
        this.core = core;
    }

    dispose() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
    }

    onEvent(event: BearEvent): boolean {
        if (event.type === 'typing') {
            const { text, cursorIndex } = event.payload;
            this.handleTyping(text, cursorIndex);
            return false; // Don't block, allow others to see typing
        }

        if (event.type === 'keydown') {
            const { key } = event.payload;
            if (key === 'Tab' && this.core.currentSuggestion?.type === 'text-completion') {
                this.core.currentSuggestion.onAccept();
                return true; // Consume Tab
            }
            if (key === 'Escape' && this.core.currentSuggestion) {
                this.core.setSuggestion(null);
                return true; // Consume Escape
            }
        }

        return false;
    }

    update(deltaTime: number) {
        // Animation logic if needed
    }

    private handleTyping(text: string, cursorIndex: number) {
        // Clear existing suggestion on typing
        if (this.core.currentSuggestion) {
            this.core.setSuggestion(null);
        }

        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        // Simple heuristic: only suggest if user pauses or types enough context
        if (text.length < 5) return;

        this.debounceTimer = setTimeout(() => {
            this.fetchSuggestion(text);
        }, 600); // 600ms debounce
    }

    private async fetchSuggestion(text: string) {
        this.core.setState({ expression: 'thinking' });

        try {
            // In a real app, this would call the Supabase Edge Function
            // For now, we simulate a response or call the actual endpoint if configured

            // Mocking the AI response for immediate feedback in this refactor
            // You would replace this with `fetch(CHAT_URL, ...)`

            // Simulating network delay
            // await new Promise(r => setTimeout(r, 500));

            // Mock logic
            const suffix = this.predictNextWords(text);
            if (suffix) {
                const suggestion: Suggestion = {
                    id: `auto-${Date.now()}`,
                    type: 'text-completion',
                    content: suffix,
                    preview: suffix,
                    onAccept: () => {
                        // Dispatch event to insert text
                        this.core.dispatch({
                            type: 'lifecycle', // Using lifecycle as a catch-all for now or define 'action'
                            payload: { action: 'insert_text', text: suffix }
                        });
                        this.core.setSuggestion(null);
                        this.core.setState({ expression: 'happy' });
                        setTimeout(() => this.core.setState({ expression: 'neutral' }), 2000);
                    },
                    onReject: () => {
                        this.core.setSuggestion(null);
                    }
                };

                this.core.setSuggestion(suggestion);
                this.core.setState({ expression: 'suggesting' });
            } else {
                this.core.setState({ expression: 'neutral' });
            }
        } catch (e) {
            console.error(e);
            this.core.setState({ expression: 'error' });
        }
    }

    private predictNextWords(text: string): string | null {
        // Simple mock dictionary for demonstration
        const commonPhrases: Record<string, string> = {
            "como criar": " um diagrama de fluxo",
            "plano de": " marketing digital",
            "brainstorming": " para novas ideias",
            "roadmap": " de produto Q4",
            "user": " story mapping",
        };

        const lower = text.toLowerCase();
        for (const key in commonPhrases) {
            if (lower.endsWith(key)) {
                return commonPhrases[key];
            }
        }
        return null;
    }
}
