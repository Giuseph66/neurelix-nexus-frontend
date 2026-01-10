export type ToolType = 
  | 'select'
  | 'pan'
  | 'pencil'
  | 'eraser'
  | 'rectangle'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'text'
  | 'postit';

export interface WhiteboardObject {
  id: string;
  whiteboard_id: string;
  type: string;
  properties: Record<string, unknown>;
  z_index: number;
  locked: boolean;
  group_id: string | null;
  linked_task_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Whiteboard {
  id: string;
  project_id: string;
  name: string;
  created_by: string | null;
  parent_branch_id: string | null;
  branch_name: string | null;
  branch_metadata: Record<string, unknown>;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  settings: Record<string, unknown>;
  canvas_snapshot?: Record<string, unknown> | null;
  snapshot_version?: number;
  created_at: string;
  updated_at: string;
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}
