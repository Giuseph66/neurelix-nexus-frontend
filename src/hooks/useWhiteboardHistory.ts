import { useState, useCallback, useRef } from "react";

interface HistoryState {
  objects: string; // JSON serialized canvas state
}

const MAX_HISTORY = 50;

export function useWhiteboardHistory() {
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const isUndoRedoRef = useRef(false);

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  const saveState = useCallback((objectsJson: string) => {
    // Skip if this is triggered by undo/redo
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }

    setHistory(prev => {
      // Remove any future states if we're not at the end
      const newHistory = prev.slice(0, currentIndex + 1);
      
      // Add new state
      newHistory.push({ objects: objectsJson });
      
      // Limit history size
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
        return newHistory;
      }
      
      return newHistory;
    });
    
    setCurrentIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [currentIndex]);

  const undo = useCallback((): string | null => {
    if (!canUndo) return null;
    
    isUndoRedoRef.current = true;
    const newIndex = currentIndex - 1;
    setCurrentIndex(newIndex);
    return history[newIndex]?.objects || null;
  }, [canUndo, currentIndex, history]);

  const redo = useCallback((): string | null => {
    if (!canRedo) return null;
    
    isUndoRedoRef.current = true;
    const newIndex = currentIndex + 1;
    setCurrentIndex(newIndex);
    return history[newIndex]?.objects || null;
  }, [canRedo, currentIndex, history]);

  const clear = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  return {
    saveState,
    undo,
    redo,
    clear,
    canUndo,
    canRedo,
  };
}
