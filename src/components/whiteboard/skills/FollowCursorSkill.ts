import { Skill, BearEvent } from "../bear-core/types";
import { BearCore } from "../bear-core/BearCore";

export class FollowCursorSkill implements Skill {
    id = "follow-cursor";
    name = "Follow Cursor";
    priority = 90;

    private core!: BearCore;
    private targetPos = { x: 0, y: 0 };

    init(core: any) {
        this.core = core;
        this.targetPos = { ...core.state.pointerPosition };
    }

    dispose() { }

    onEvent(event: BearEvent): boolean {
        return false;
    }

    update(deltaTime: number) {
        // Lerp towards pointer position
        const pointer = this.core.state.pointerPosition;
        const current = this.core.state.position;

        // Smooth factor (0.1 is slow, 0.9 is fast)
        // Adjust based on deltaTime for frame-rate independence ideally
        const t = 0.15;

        const newX = current.x + (pointer.x - current.x) * t;
        const newY = current.y + (pointer.y - current.y) * t;

        // Only update if moved significantly to avoid jitter
        if (Math.abs(newX - current.x) > 0.1 || Math.abs(newY - current.y) > 0.1) {
            this.core.setState({
                position: { x: newX, y: newY }
            });
        }
    }
}
