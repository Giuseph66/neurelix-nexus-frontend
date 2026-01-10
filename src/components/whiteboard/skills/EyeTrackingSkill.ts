import { Skill, BearEvent } from "../bear-core/types";
import { BearCore } from "../bear-core/BearCore";

export class EyeTrackingSkill implements Skill {
    id = "eye-tracking";
    name = "Eye Tracking";
    priority = 100;

    private core: any; // Using any to avoid circular type issues if strict
    private handleMouseMove = (e: MouseEvent) => {
        this.core.setState({
            pointerPosition: { x: e.clientX, y: e.clientY }
        });
    };

    init(core: any) {
        this.core = core;
        window.addEventListener("mousemove", this.handleMouseMove);
    }

    dispose() {
        window.removeEventListener("mousemove", this.handleMouseMove);
    }

    onEvent(event: BearEvent) {
        // We don't block other skills, just passively track
        return false;
    }

    update(deltaTime: number) {
        // No per-frame update needed, event driven
    }
}
