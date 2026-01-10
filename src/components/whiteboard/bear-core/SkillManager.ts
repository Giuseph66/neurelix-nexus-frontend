import { Skill, BearEvent } from "./types";
import { BearCore } from "./BearCore";

export class SkillManager {
    private skills: Skill[] = [];
    private core: BearCore;

    constructor(core: BearCore) {
        this.core = core;
    }

    register(skill: Skill) {
        if (this.skills.find(s => s.id === skill.id)) {
            console.warn(`Skill ${skill.id} already registered.`);
            return;
        }
        this.skills.push(skill);
        this.skills.sort((a, b) => b.priority - a.priority);
        skill.init(this.core);

        if (this.core.state.debugMode) {
            console.log(`[BearSkill] Registered: ${skill.name}`);
        }
    }

    unregister(skillId: string) {
        const index = this.skills.findIndex(s => s.id === skillId);
        if (index !== -1) {
            this.skills[index].dispose();
            this.skills.splice(index, 1);
        }
    }

    handleEvent(event: BearEvent) {
        for (const skill of this.skills) {
            // If a skill handles the event and returns true, stop propagation
            // This allows high-priority skills to block others (e.g. autocomplete blocks idle animations)
            if (skill.onEvent(event)) {
                if (this.core.state.debugMode) {
                    console.log(`[BearSkill] Event ${event.type} handled by ${skill.id}`);
                }
                return;
            }
        }
    }

    update(deltaTime: number) {
        for (const skill of this.skills) {
            skill.update(deltaTime);
        }
    }

    dispose() {
        this.skills.forEach(s => s.dispose());
        this.skills = [];
    }

    getSkills() {
        return [...this.skills];
    }
}
