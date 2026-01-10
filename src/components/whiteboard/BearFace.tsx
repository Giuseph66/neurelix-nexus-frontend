import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { BearExpression } from "./bear-core/types";
import { BearCore } from "./bear-core/BearCore";

interface BearFaceProps {
    expression?: BearExpression;
    className?: string;
    onClick?: () => void;
    size?: number;
    // If provided, overrides internal tracking
    eyeOffset?: { x: number, y: number };
}

export function BearFace({
    expression = 'neutral',
    className,
    onClick,
    size = 48,
    eyeOffset
}: BearFaceProps) {
    const faceRef = useRef<SVGSVGElement>(null);
    const leftEyeRef = useRef<SVGEllipseElement>(null);
    const rightEyeRef = useRef<SVGEllipseElement>(null);

    // Direct DOM manipulation for eyes to avoid React re-renders
    useEffect(() => {
        if (eyeOffset) {
            updateEyes(eyeOffset.x, eyeOffset.y);
            return;
        }

        const core = BearCore.getInstance();

        const update = () => {
            if (!faceRef.current) return;

            const rect = faceRef.current.getBoundingClientRect();
            const faceCenterX = rect.left + rect.width / 2;
            const faceCenterY = rect.top + rect.height / 2;

            const pointer = core.state.pointerPosition;

            const dx = pointer.x - faceCenterX;
            const dy = pointer.y - faceCenterY;

            const maxOffset = 3;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const normalizedDistance = Math.min(distance / 200, 1);

            const offsetX = (dx / (distance || 1)) * maxOffset * normalizedDistance;
            const offsetY = (dy / (distance || 1)) * maxOffset * normalizedDistance;

            updateEyes(offsetX, offsetY);

            requestAnimationFrame(update);
        };

        const rafId = requestAnimationFrame(update);
        return () => cancelAnimationFrame(rafId);
    }, [eyeOffset]);

    const updateEyes = (x: number, y: number) => {
        if (leftEyeRef.current) {
            leftEyeRef.current.setAttribute("cx", (35 + x).toString());
            leftEyeRef.current.setAttribute("cy", (45 + y).toString());
        }
        if (rightEyeRef.current) {
            rightEyeRef.current.setAttribute("cx", (65 + x).toString());
            rightEyeRef.current.setAttribute("cy", (45 + y).toString());
        }
    };

    // Expression definitions
    const getBrows = () => {
        switch (expression) {
            case 'happy':
                return (
                    <>
                        <path d="M 28 30 Q 35 25 42 30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                        <path d="M 58 30 Q 65 25 72 30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                    </>
                );
            case 'focused':
            case 'thinking':
                return (
                    <>
                        <path d="M 28 32 L 42 35" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                        <path d="M 58 35 L 72 32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                    </>
                );
            case 'surprised':
                return (
                    <>
                        <path d="M 28 25 Q 35 20 42 25" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                        <path d="M 58 25 Q 65 20 72 25" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                    </>
                );
            case 'concerned':
            case 'error':
                return (
                    <>
                        <path d="M 28 30 L 42 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                        <path d="M 58 28 L 72 30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                    </>
                );
            case 'excited':
            case 'suggesting':
                return (
                    <>
                        <path d="M 28 28 Q 35 22 42 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                        <path d="M 58 28 Q 65 22 72 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                    </>
                );
            case 'skeptical':
                return (
                    <>
                        <path d="M 28 32 Q 35 28 42 32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                        <path d="M 58 34 L 72 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                    </>
                );
            default: // neutral
                return (
                    <>
                        <path d="M 28 32 Q 35 28 42 32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                        <path d="M 58 32 Q 65 28 72 32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
                    </>
                );
        }
    };

    const getMouth = () => {
        switch (expression) {
            case 'happy':
                return <path d="M 35 65 Q 50 75 65 65" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />;
            case 'focused':
                return <line x1="40" y1="70" x2="60" y2="70" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />;
            case 'thinking':
                return <path d="M 40 70 Q 50 65 60 70" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />;
            case 'surprised':
                return <ellipse cx="50" cy="70" rx="6" ry="8" stroke="currentColor" strokeWidth="3" fill="none" />;
            case 'concerned':
            case 'error':
                return <path d="M 35 75 Q 50 65 65 75" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />;
            case 'excited':
            case 'suggesting':
                return <path d="M 35 65 Q 50 80 65 65" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />;
            case 'skeptical':
                return <line x1="35" y1="70" x2="65" y2="70" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />;
            default: // neutral
                return <line x1="35" y1="70" x2="65" y2="70" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />;
        }
    };

    const getEyes = () => {
        const eyeSizeY = ['surprised', 'excited', 'suggesting'].includes(expression) ? 7 : 5;

        return (
            <>
                <ellipse
                    ref={leftEyeRef}
                    cx="35"
                    cy="45"
                    rx="4"
                    ry={eyeSizeY}
                    fill="currentColor"
                />
                <ellipse
                    ref={rightEyeRef}
                    cx="65"
                    cy="45"
                    rx="4"
                    ry={eyeSizeY}
                    fill="currentColor"
                />
            </>
        );
    };

    return (
        <svg
            ref={faceRef}
            width={size}
            height={size}
            viewBox="0 0 100 100"
            className={cn("text-foreground", className)}
            onClick={onClick}
        >
            {/* Face circle */}
            <circle
                cx="50"
                cy="50"
                r="46"
                fill="hsl(var(--background))"
                stroke="currentColor"
                strokeWidth="4"
            />

            {getBrows()}
            {getEyes()}
            {getMouth()}
        </svg>
    );
}
