export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      boards: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_favorite: boolean | null
          name: string
          project_id: string
          type: Database["public"]["Enums"]["board_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_favorite?: boolean | null
          name: string
          project_id: string
          type?: Database["public"]["Enums"]["board_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_favorite?: boolean | null
          name?: string
          project_id?: string
          type?: Database["public"]["Enums"]["board_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mentions: {
        Row: {
          comment_id: string
          created_at: string | null
          id: string
          mentioned_user_id: string
          read: boolean | null
        }
        Insert: {
          comment_id: string
          created_at?: string | null
          id?: string
          mentioned_user_id: string
          read?: boolean | null
        }
        Update: {
          comment_id?: string
          created_at?: string | null
          id?: string
          mentioned_user_id?: string
          read?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "whiteboard_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentions_mentioned_user_id_profiles_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_invites: {
        Row: {
          id: string
          project_id: string
          email: string
          role: Database["public"]["Enums"]["app_role"]
          invited_by: string
          token: string
          accepted_at: string | null
          expires_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          email: string
          role?: Database["public"]["Enums"]["app_role"]
          invited_by: string
          token?: string
          accepted_at?: string | null
          expires_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          email?: string
          role?: Database["public"]["Enums"]["app_role"]
          invited_by?: string
          token?: string
          accepted_at?: string | null
          expires_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_invites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_sequences: {
        Row: {
          last_sequence: number
          project_id: string
        }
        Insert: {
          last_sequence?: number
          project_id: string
        }
        Update: {
          last_sequence?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_sequences_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      sprints: {
        Row: {
          board_id: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          goal: string | null
          id: string
          name: string
          project_id: string
          start_date: string | null
          state: Database["public"]["Enums"]["sprint_state"]
          updated_at: string
        }
        Insert: {
          board_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          goal?: string | null
          id?: string
          name: string
          project_id: string
          start_date?: string | null
          state?: Database["public"]["Enums"]["sprint_state"]
          updated_at?: string
        }
        Update: {
          board_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          goal?: string | null
          id?: string
          name?: string
          project_id?: string
          start_date?: string | null
          state?: Database["public"]["Enums"]["sprint_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprints_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefa_activity_log: {
        Row: {
          action: string
          created_at: string
          field_name: string | null
          id: string
          metadata: Json | null
          new_value: string | null
          old_value: string | null
          tarefa_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          field_name?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          tarefa_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          field_name?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          tarefa_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefa_activity_log_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefa_comments: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          tarefa_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          id?: string
          tarefa_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          tarefa_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefa_comments_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefa_git_links: {
        Row: {
          branch: string | null
          commit_sha: string | null
          created_at: string
          created_by: string | null
          id: string
          metadata: Json | null
          pr_number: number | null
          provider: string
          tarefa_id: string
          url: string | null
        }
        Insert: {
          branch?: string | null
          commit_sha?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json | null
          pr_number?: number | null
          provider?: string
          tarefa_id: string
          url?: string | null
        }
        Update: {
          branch?: string | null
          commit_sha?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json | null
          pr_number?: number | null
          provider?: string
          tarefa_id?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tarefa_git_links_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefa_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          link_type: Database["public"]["Enums"]["issue_link_type"]
          source_tarefa_id: string
          target_tarefa_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          link_type: Database["public"]["Enums"]["issue_link_type"]
          source_tarefa_id: string
          target_tarefa_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          link_type?: Database["public"]["Enums"]["issue_link_type"]
          source_tarefa_id?: string
          target_tarefa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefa_links_source_tarefa_id_fkey"
            columns: ["source_tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_links_target_tarefa_id_fkey"
            columns: ["target_tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefa_watchers: {
        Row: {
          created_at: string
          id: string
          tarefa_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tarefa_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tarefa_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefa_watchers_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefa_whiteboard_origin: {
        Row: {
          area_bounds: Json | null
          created_at: string
          id: string
          node_ids: string[] | null
          snapshot_preview: string | null
          snapshot_title: string | null
          tarefa_id: string
          whiteboard_id: string
        }
        Insert: {
          area_bounds?: Json | null
          created_at?: string
          id?: string
          node_ids?: string[] | null
          snapshot_preview?: string | null
          snapshot_title?: string | null
          tarefa_id: string
          whiteboard_id: string
        }
        Update: {
          area_bounds?: Json | null
          created_at?: string
          id?: string
          node_ids?: string[] | null
          snapshot_preview?: string | null
          snapshot_title?: string | null
          tarefa_id?: string
          whiteboard_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefa_whiteboard_origin_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: true
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_whiteboard_origin_whiteboard_id_fkey"
            columns: ["whiteboard_id"]
            isOneToOne: false
            referencedRelation: "whiteboards"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas: {
        Row: {
          assignee_id: string | null
          backlog_position: number | null
          board_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          epic_id: string | null
          estimated_hours: number | null
          id: string
          key: string
          labels: string[] | null
          parent_id: string | null
          priority: Database["public"]["Enums"]["tarefa_priority"]
          project_id: string
          reporter_id: string | null
          sprint_id: string | null
          status_id: string | null
          title: string
          type: Database["public"]["Enums"]["tarefa_type"]
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          backlog_position?: number | null
          board_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          epic_id?: string | null
          estimated_hours?: number | null
          id?: string
          key: string
          labels?: string[] | null
          parent_id?: string | null
          priority?: Database["public"]["Enums"]["tarefa_priority"]
          project_id: string
          reporter_id?: string | null
          sprint_id?: string | null
          status_id?: string | null
          title: string
          type?: Database["public"]["Enums"]["tarefa_type"]
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          backlog_position?: number | null
          board_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          epic_id?: string | null
          estimated_hours?: number | null
          id?: string
          key?: string
          labels?: string[] | null
          parent_id?: string | null
          priority?: Database["public"]["Enums"]["tarefa_priority"]
          project_id?: string
          reporter_id?: string | null
          sprint_id?: string | null
          status_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["tarefa_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_epic_id_fkey"
            columns: ["epic_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "workflow_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whiteboard_collaborators: {
        Row: {
          color: string | null
          created_at: string | null
          cursor_x: number | null
          cursor_y: number | null
          id: string
          last_seen: string | null
          user_id: string
          whiteboard_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          cursor_x?: number | null
          cursor_y?: number | null
          id?: string
          last_seen?: string | null
          user_id: string
          whiteboard_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          cursor_x?: number | null
          cursor_y?: number | null
          id?: string
          last_seen?: string | null
          user_id?: string
          whiteboard_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whiteboard_collaborators_whiteboard_id_fkey"
            columns: ["whiteboard_id"]
            isOneToOne: false
            referencedRelation: "whiteboards"
            referencedColumns: ["id"]
          },
        ]
      }
      whiteboard_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          object_id: string | null
          parent_comment_id: string | null
          position_x: number | null
          position_y: number | null
          resolved: boolean | null
          updated_at: string | null
          user_id: string
          whiteboard_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          object_id?: string | null
          parent_comment_id?: string | null
          position_x?: number | null
          position_y?: number | null
          resolved?: boolean | null
          updated_at?: string | null
          user_id: string
          whiteboard_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          object_id?: string | null
          parent_comment_id?: string | null
          position_x?: number | null
          position_y?: number | null
          resolved?: boolean | null
          updated_at?: string | null
          user_id?: string
          whiteboard_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whiteboard_comments_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "whiteboard_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whiteboard_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "whiteboard_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whiteboard_comments_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "whiteboard_comments_whiteboard_id_fkey"
            columns: ["whiteboard_id"]
            isOneToOne: false
            referencedRelation: "whiteboards"
            referencedColumns: ["id"]
          },
        ]
      }
      whiteboard_objects: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string | null
          id: string
          linked_task_id: string | null
          locked: boolean | null
          properties: Json
          type: string
          updated_at: string
          whiteboard_id: string
          z_index: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          linked_task_id?: string | null
          locked?: boolean | null
          properties?: Json
          type: string
          updated_at?: string
          whiteboard_id: string
          z_index?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          linked_task_id?: string | null
          locked?: boolean | null
          properties?: Json
          type?: string
          updated_at?: string
          whiteboard_id?: string
          z_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "whiteboard_objects_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "whiteboard_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whiteboard_objects_whiteboard_id_fkey"
            columns: ["whiteboard_id"]
            isOneToOne: false
            referencedRelation: "whiteboards"
            referencedColumns: ["id"]
          },
        ]
      }
      whiteboards: {
        Row: {
          branch_metadata: Json | null
          branch_name: string | null
          canvas_snapshot: Json | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          parent_branch_id: string | null
          project_id: string
          settings: Json | null
          snapshot_version: number
          updated_at: string
          viewport: Json | null
        }
        Insert: {
          branch_metadata?: Json | null
          branch_name?: string | null
          canvas_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          parent_branch_id?: string | null
          project_id: string
          settings?: Json | null
          snapshot_version?: number
          updated_at?: string
          viewport?: Json | null
        }
        Update: {
          branch_metadata?: Json | null
          branch_name?: string | null
          canvas_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          parent_branch_id?: string | null
          project_id?: string
          settings?: Json | null
          snapshot_version?: number
          updated_at?: string
          viewport?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "whiteboards_parent_branch_id_fkey"
            columns: ["parent_branch_id"]
            isOneToOne: false
            referencedRelation: "whiteboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whiteboards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_statuses: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_final: boolean | null
          is_initial: boolean | null
          name: string
          position: number
          workflow_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_final?: boolean | null
          is_initial?: boolean | null
          name: string
          position?: number
          workflow_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_final?: boolean | null
          is_initial?: boolean | null
          name?: string
          position?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_statuses_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_transitions: {
        Row: {
          created_at: string
          from_status_id: string
          id: string
          name: string | null
          to_status_id: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          from_status_id: string
          id?: string
          name?: string | null
          to_status_id: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          from_status_id?: string
          id?: string
          name?: string | null
          to_status_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_transitions_from_status_id_fkey"
            columns: ["from_status_id"]
            isOneToOne: false
            referencedRelation: "workflow_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_transitions_to_status_id_fkey"
            columns: ["to_status_id"]
            isOneToOne: false
            referencedRelation: "workflow_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_transitions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          board_id: string
          created_at: string
          id: string
          is_default: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          board_id: string
          created_at?: string
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string
        }
        Update: {
          board_id?: string
          created_at?: string
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_default_workflow: { Args: { p_board_id: string }; Returns: string }
      create_whiteboard_branch: {
        Args: { branch_name: string; source_whiteboard_id: string }
        Returns: string
      }
      generate_tarefa_key: { Args: { p_project_id: string }; Returns: string }
      get_project_role: {
        Args: { _project_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      merge_whiteboard_branch: {
        Args: { branch_whiteboard_id: string; target_whiteboard_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "tech_lead" | "developer" | "viewer"
      board_type: "KANBAN" | "SCRUM"
      issue_link_type: "BLOCKS" | "IS_BLOCKED_BY" | "RELATES"
      sprint_state: "PLANNED" | "ACTIVE" | "DONE"
      tarefa_priority: "LOWEST" | "LOW" | "MEDIUM" | "HIGH" | "HIGHEST"
      tarefa_type: "EPIC" | "TASK" | "SUBTASK" | "BUG" | "STORY"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "tech_lead", "developer", "viewer"],
      board_type: ["KANBAN", "SCRUM"],
      issue_link_type: ["BLOCKS", "IS_BLOCKED_BY", "RELATES"],
      sprint_state: ["PLANNED", "ACTIVE", "DONE"],
      tarefa_priority: ["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"],
      tarefa_type: ["EPIC", "TASK", "SUBTASK", "BUG", "STORY"],
    },
  },
} as const
