import { useEffect } from "react";
import { ToolType } from "@/components/whiteboard/types";

interface UseWhiteboardKeyboardOptions {
  onToolChange: (tool: ToolType) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSelectAll: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  enabled?: boolean;
}

const toolShortcuts: Record<string, ToolType> = {
  'v': 'select',
  'h': 'pan',
  'p': 'pencil',
  'e': 'eraser',
  'r': 'rectangle',
  'o': 'circle',
  'l': 'line',
  'a': 'arrow',
  't': 'text',
  'n': 'postit',
};

export function useWhiteboardKeyboard({
  onToolChange,
  onUndo,
  onRedo,
  onDelete,
  onDuplicate,
  onSelectAll,
  onCopy,
  onPaste,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  enabled = true,
}: UseWhiteboardKeyboardOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const key = e.key.toLowerCase();
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Tool shortcuts (single key)
      if (!isCtrlOrCmd && !e.shiftKey && toolShortcuts[key]) {
        e.preventDefault();
        onToolChange(toolShortcuts[key]);
        return;
      }

      // Ctrl/Cmd shortcuts
      if (isCtrlOrCmd) {
        switch (key) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) {
              onRedo();
            } else {
              onUndo();
            }
            break;
          case 'y':
            e.preventDefault();
            onRedo();
            break;
          case 'd':
            e.preventDefault();
            onDuplicate();
            break;
          case 'a':
            e.preventDefault();
            onSelectAll();
            break;
          case 'c':
            e.preventDefault();
            onCopy();
            break;
          case 'v':
            e.preventDefault();
            onPaste();
            break;
          case '=':
          case '+':
            e.preventDefault();
            onZoomIn();
            break;
          case '-':
            e.preventDefault();
            onZoomOut();
            break;
          case '0':
            e.preventDefault();
            onZoomReset();
            break;
        }
        return;
      }

      // Delete/Backspace
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        onDelete();
      }

      // Escape - go to select tool
      if (key === 'escape') {
        e.preventDefault();
        onToolChange('select');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enabled,
    onToolChange,
    onUndo,
    onRedo,
    onDelete,
    onDuplicate,
    onSelectAll,
    onCopy,
    onPaste,
    onZoomIn,
    onZoomOut,
    onZoomReset,
  ]);
}
