// Types for the Tarefas (Gira/Jira-like) module

export type BoardType = 'KANBAN' | 'SCRUM';
export type TarefaType = 'EPIC' | 'TASK' | 'SUBTASK' | 'BUG' | 'STORY';
export type TarefaPriority = 'LOWEST' | 'LOW' | 'MEDIUM' | 'HIGH' | 'HIGHEST';
export type SprintState = 'PLANNED' | 'ACTIVE' | 'DONE';
export type IssueLinkType = 'BLOCKS' | 'IS_BLOCKED_BY' | 'RELATES';

export interface Board {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  type: BoardType;
  is_favorite: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Workflow {
  id: string;
  board_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStatus {
  id: string;
  workflow_id: string;
  name: string;
  color: string;
  position: number;
  is_initial: boolean;
  is_final: boolean;
  created_at: string;
}

export interface WorkflowTransition {
  id: string;
  workflow_id: string;
  from_status_id: string;
  to_status_id: string;
  name?: string;
  created_at: string;
}

export interface Sprint {
  id: string;
  project_id: string;
  board_id?: string;
  name: string;
  goal?: string;
  start_date?: string;
  end_date?: string;
  state: SprintState;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Tarefa {
  id: string;
  project_id: string;
  board_id?: string;
  key: string;
  type: TarefaType;
  title: string;
  description?: string;
  status_id?: string;
  priority: TarefaPriority;
  assignee_id?: string;
  reporter_id?: string;
  parent_id?: string;
  epic_id?: string;
  sprint_id?: string;
  labels: string[];
  due_date?: string;
  estimated_hours?: number;
  backlog_position?: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  status?: WorkflowStatus;
  assignee?: { id: string; full_name: string; avatar_url?: string };
  reporter?: { id: string; full_name: string; avatar_url?: string };
  epic?: { id: string; key: string; title: string };
  sprint?: Sprint;
  whiteboard_origin?: TarefaWhiteboardOrigin;
  comments_count?: number;
}

export interface TarefaComment {
  id: string;
  tarefa_id: string;
  content: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  author?: { id: string; full_name: string; avatar_url?: string };
}

export interface TarefaActivityLog {
  id: string;
  tarefa_id: string;
  user_id: string;
  action: string;
  field_name?: string;
  old_value?: string;
  new_value?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  user?: { id: string; full_name: string; avatar_url?: string };
}

export interface TarefaLink {
  id: string;
  source_tarefa_id: string;
  target_tarefa_id: string;
  link_type: IssueLinkType;
  created_by?: string;
  created_at: string;
  target_tarefa?: { id: string; key: string; title: string; status?: WorkflowStatus };
}

export interface TarefaWhiteboardOrigin {
  id: string;
  tarefa_id: string;
  whiteboard_id: string;
  node_ids: string[];
  area_bounds?: { x: number; y: number; width: number; height: number };
  snapshot_title?: string;
  snapshot_preview?: string;
  created_at: string;
}

export interface TarefaGitLink {
  id: string;
  tarefa_id: string;
  provider: string;
  branch?: string;
  commit_sha?: string;
  pr_number?: number;
  url?: string;
  metadata?: Record<string, unknown>;
  created_by?: string;
  created_at: string;
}

// Board view types
export interface BoardColumn {
  status: WorkflowStatus;
  tarefas: Tarefa[];
  allowedTransitions: string[]; // status_ids that cards can be moved to
}

export interface BoardView {
  board: Board;
  workflow: Workflow;
  columns: BoardColumn[];
}

// Create/Update DTOs
export interface CreateTarefaInput {
  project_id: string;
  board_id?: string;
  type?: TarefaType;
  title: string;
  description?: string;
  priority?: TarefaPriority;
  assignee_id?: string;
  epic_id?: string;
  sprint_id?: string;
  labels?: string[];
  due_date?: string;
  estimated_hours?: number;
}

export interface UpdateTarefaInput {
  title?: string;
  description?: string;
  type?: TarefaType;
  priority?: TarefaPriority;
  assignee_id?: string | null;
  epic_id?: string | null;
  sprint_id?: string | null;
  labels?: string[];
  due_date?: string | null;
  estimated_hours?: number | null;
}

export interface TransitionTarefaInput {
  to_status_id: string;
}

export interface CreateBoardInput {
  project_id: string;
  name: string;
  description?: string;
  type?: BoardType;
}

export interface CreateCommentInput {
  content: string;
}

// Priority display helpers
export const PRIORITY_CONFIG: Record<TarefaPriority, { label: string; color: string; icon: string }> = {
  HIGHEST: { label: 'Máxima', color: '#DC2626', icon: '⬆️⬆️' },
  HIGH: { label: 'Alta', color: '#EA580C', icon: '⬆️' },
  MEDIUM: { label: 'Média', color: '#CA8A04', icon: '➡️' },
  LOW: { label: 'Baixa', color: '#16A34A', icon: '⬇️' },
  LOWEST: { label: 'Mínima', color: '#0D9488', icon: '⬇️⬇️' },
};

export const TYPE_CONFIG: Record<TarefaType, { label: string; color: string; icon: string }> = {
  EPIC: { label: 'Epic', color: '#7C3AED', icon: '⚡' },
  STORY: { label: 'Story', color: '#10B981', icon: '📖' },
  TASK: { label: 'Task', color: '#3B82F6', icon: '✓' },
  SUBTASK: { label: 'Subtask', color: '#6B7280', icon: '○' },
  BUG: { label: 'Bug', color: '#DC2626', icon: '🐛' },
};
