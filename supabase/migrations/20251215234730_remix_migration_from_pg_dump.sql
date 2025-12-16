CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'tech_lead',
    'developer',
    'viewer'
);


--
-- Name: board_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.board_type AS ENUM (
    'KANBAN',
    'SCRUM'
);


--
-- Name: issue_link_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.issue_link_type AS ENUM (
    'BLOCKS',
    'IS_BLOCKED_BY',
    'RELATES'
);


--
-- Name: sprint_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sprint_state AS ENUM (
    'PLANNED',
    'ACTIVE',
    'DONE'
);


--
-- Name: tarefa_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tarefa_priority AS ENUM (
    'LOWEST',
    'LOW',
    'MEDIUM',
    'HIGH',
    'HIGHEST'
);


--
-- Name: tarefa_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tarefa_type AS ENUM (
    'EPIC',
    'TASK',
    'SUBTASK',
    'BUG',
    'STORY'
);


--
-- Name: create_default_workflow(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_default_workflow(p_board_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_workflow_id UUID;
  v_todo_id UUID;
  v_doing_id UUID;
  v_done_id UUID;
BEGIN
  INSERT INTO workflows (board_id, name, is_default)
  VALUES (p_board_id, 'Default Workflow', true)
  RETURNING id INTO v_workflow_id;
  
  INSERT INTO workflow_statuses (workflow_id, name, color, position, is_initial)
  VALUES (v_workflow_id, 'To Do', '#6B7280', 0, true)
  RETURNING id INTO v_todo_id;
  
  INSERT INTO workflow_statuses (workflow_id, name, color, position)
  VALUES (v_workflow_id, 'In Progress', '#3B82F6', 1)
  RETURNING id INTO v_doing_id;
  
  INSERT INTO workflow_statuses (workflow_id, name, color, position, is_final)
  VALUES (v_workflow_id, 'Done', '#10B981', 2, true)
  RETURNING id INTO v_done_id;
  
  INSERT INTO workflow_transitions (workflow_id, from_status_id, to_status_id, name) VALUES
    (v_workflow_id, v_todo_id, v_doing_id, 'Start Progress'),
    (v_workflow_id, v_doing_id, v_todo_id, 'Stop Progress'),
    (v_workflow_id, v_doing_id, v_done_id, 'Complete'),
    (v_workflow_id, v_done_id, v_doing_id, 'Reopen');
  
  RETURN v_workflow_id;
END;
$$;


--
-- Name: create_whiteboard_branch(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_whiteboard_branch(source_whiteboard_id uuid, branch_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  new_whiteboard_id UUID;
  source_whiteboard RECORD;
BEGIN
  -- Get source whiteboard
  SELECT * INTO source_whiteboard FROM whiteboards WHERE id = source_whiteboard_id;
  
  IF source_whiteboard IS NULL THEN
    RAISE EXCEPTION 'Whiteboard not found';
  END IF;
  
  -- Create new whiteboard as branch
  INSERT INTO whiteboards (
    project_id,
    name,
    branch_name,
    parent_branch_id,
    viewport,
    settings,
    created_by,
    branch_metadata
  ) VALUES (
    source_whiteboard.project_id,
    source_whiteboard.name || ' (branch: ' || branch_name || ')',
    branch_name,
    source_whiteboard_id,
    source_whiteboard.viewport,
    source_whiteboard.settings,
    auth.uid(),
    jsonb_build_object(
      'created_from', source_whiteboard_id,
      'created_at', now()
    )
  )
  RETURNING id INTO new_whiteboard_id;
  
  -- Copy all objects to new whiteboard
  INSERT INTO whiteboard_objects (
    whiteboard_id,
    type,
    properties,
    z_index,
    locked,
    group_id,
    created_by
  )
  SELECT 
    new_whiteboard_id,
    type,
    properties,
    z_index,
    locked,
    group_id,
    auth.uid()
  FROM whiteboard_objects
  WHERE whiteboard_id = source_whiteboard_id;
  
  RETURN new_whiteboard_id;
END;
$$;


--
-- Name: generate_tarefa_key(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_tarefa_key(p_project_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_slug TEXT;
  v_seq INTEGER;
BEGIN
  SELECT slug INTO v_slug FROM projects WHERE id = p_project_id;
  
  INSERT INTO project_sequences (project_id, last_sequence)
  VALUES (p_project_id, 1)
  ON CONFLICT (project_id) 
  DO UPDATE SET last_sequence = project_sequences.last_sequence + 1
  RETURNING last_sequence INTO v_seq;
  
  RETURN UPPER(v_slug) || '-' || v_seq;
END;
$$;


--
-- Name: get_project_role(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_project_role(_user_id uuid, _project_id uuid) RETURNS public.app_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT role
  FROM public.project_members
  WHERE user_id = _user_id
    AND project_id = _project_id
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--
-- Name: is_project_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_project_member(_user_id uuid, _project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE user_id = _user_id
      AND project_id = _project_id
  )
$$;


--
-- Name: merge_whiteboard_branch(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.merge_whiteboard_branch(branch_whiteboard_id uuid, target_whiteboard_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Verify branch relationship
  IF NOT EXISTS (
    SELECT 1 FROM whiteboards 
    WHERE id = branch_whiteboard_id 
    AND parent_branch_id = target_whiteboard_id
  ) THEN
    RAISE EXCEPTION 'Invalid branch relationship';
  END IF;
  
  -- Delete existing objects in target
  DELETE FROM whiteboard_objects WHERE whiteboard_id = target_whiteboard_id;
  
  -- Copy objects from branch to target
  INSERT INTO whiteboard_objects (
    whiteboard_id,
    type,
    properties,
    z_index,
    locked,
    group_id,
    created_by
  )
  SELECT 
    target_whiteboard_id,
    type,
    properties,
    z_index,
    locked,
    group_id,
    auth.uid()
  FROM whiteboard_objects
  WHERE whiteboard_id = branch_whiteboard_id;
  
  -- Update branch metadata
  UPDATE whiteboards
  SET branch_metadata = branch_metadata || jsonb_build_object(
    'merged_at', now(),
    'merged_to', target_whiteboard_id
  )
  WHERE id = branch_whiteboard_id;
  
  RETURN TRUE;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: boards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    type public.board_type DEFAULT 'KANBAN'::public.board_type NOT NULL,
    is_favorite boolean DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mentions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mentions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comment_id uuid NOT NULL,
    mentioned_user_id uuid NOT NULL,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'developer'::public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_sequences (
    project_id uuid NOT NULL,
    last_sequence integer DEFAULT 0 NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    slug text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sprints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sprints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    board_id uuid,
    name text NOT NULL,
    goal text,
    start_date date,
    end_date date,
    state public.sprint_state DEFAULT 'PLANNED'::public.sprint_state NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tarefa_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tarefa_activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tarefa_id uuid NOT NULL,
    user_id uuid NOT NULL,
    action text NOT NULL,
    field_name text,
    old_value text,
    new_value text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tarefa_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tarefa_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tarefa_id uuid NOT NULL,
    content text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tarefa_git_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tarefa_git_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tarefa_id uuid NOT NULL,
    provider text DEFAULT 'github'::text NOT NULL,
    branch text,
    commit_sha text,
    pr_number integer,
    url text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tarefa_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tarefa_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_tarefa_id uuid NOT NULL,
    target_tarefa_id uuid NOT NULL,
    link_type public.issue_link_type NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tarefa_watchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tarefa_watchers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tarefa_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tarefa_whiteboard_origin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tarefa_whiteboard_origin (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tarefa_id uuid NOT NULL,
    whiteboard_id uuid NOT NULL,
    node_ids text[] DEFAULT '{}'::text[],
    area_bounds jsonb,
    snapshot_title text,
    snapshot_preview text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tarefas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tarefas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    board_id uuid,
    key text NOT NULL,
    type public.tarefa_type DEFAULT 'TASK'::public.tarefa_type NOT NULL,
    title text NOT NULL,
    description text,
    status_id uuid,
    priority public.tarefa_priority DEFAULT 'MEDIUM'::public.tarefa_priority NOT NULL,
    assignee_id uuid,
    reporter_id uuid,
    parent_id uuid,
    epic_id uuid,
    sprint_id uuid,
    labels text[] DEFAULT '{}'::text[],
    due_date date,
    estimated_hours numeric(10,2),
    backlog_position integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);


--
-- Name: whiteboard_collaborators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whiteboard_collaborators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    whiteboard_id uuid NOT NULL,
    user_id uuid NOT NULL,
    cursor_x double precision,
    cursor_y double precision,
    color text DEFAULT '#3B82F6'::text,
    last_seen timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: whiteboard_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whiteboard_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    whiteboard_id uuid NOT NULL,
    object_id uuid,
    user_id uuid NOT NULL,
    content text NOT NULL,
    position_x double precision,
    position_y double precision,
    resolved boolean DEFAULT false,
    parent_comment_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: whiteboard_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whiteboard_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    whiteboard_id uuid NOT NULL,
    type text NOT NULL,
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    z_index integer DEFAULT 0,
    locked boolean DEFAULT false,
    group_id uuid,
    linked_task_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whiteboards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whiteboards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    created_by uuid,
    parent_branch_id uuid,
    branch_name text,
    branch_metadata jsonb DEFAULT '{}'::jsonb,
    viewport jsonb DEFAULT '{"x": 0, "y": 0, "zoom": 1}'::jsonb,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workflow_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_statuses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6B7280'::text,
    "position" integer DEFAULT 0 NOT NULL,
    is_initial boolean DEFAULT false,
    is_final boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workflow_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_transitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_id uuid NOT NULL,
    from_status_id uuid NOT NULL,
    to_status_id uuid NOT NULL,
    name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    board_id uuid NOT NULL,
    name text DEFAULT 'Default Workflow'::text NOT NULL,
    is_default boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: boards boards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boards
    ADD CONSTRAINT boards_pkey PRIMARY KEY (id);


--
-- Name: mentions mentions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentions
    ADD CONSTRAINT mentions_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: project_members project_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_pkey PRIMARY KEY (id);


--
-- Name: project_members project_members_project_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_id_user_id_key UNIQUE (project_id, user_id);


--
-- Name: project_sequences project_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sequences
    ADD CONSTRAINT project_sequences_pkey PRIMARY KEY (project_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: projects projects_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_slug_key UNIQUE (slug);


--
-- Name: sprints sprints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprints
    ADD CONSTRAINT sprints_pkey PRIMARY KEY (id);


--
-- Name: tarefa_activity_log tarefa_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_activity_log
    ADD CONSTRAINT tarefa_activity_log_pkey PRIMARY KEY (id);


--
-- Name: tarefa_comments tarefa_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_comments
    ADD CONSTRAINT tarefa_comments_pkey PRIMARY KEY (id);


--
-- Name: tarefa_git_links tarefa_git_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_git_links
    ADD CONSTRAINT tarefa_git_links_pkey PRIMARY KEY (id);


--
-- Name: tarefa_links tarefa_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_links
    ADD CONSTRAINT tarefa_links_pkey PRIMARY KEY (id);


--
-- Name: tarefa_links tarefa_links_source_tarefa_id_target_tarefa_id_link_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_links
    ADD CONSTRAINT tarefa_links_source_tarefa_id_target_tarefa_id_link_type_key UNIQUE (source_tarefa_id, target_tarefa_id, link_type);


--
-- Name: tarefa_watchers tarefa_watchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_watchers
    ADD CONSTRAINT tarefa_watchers_pkey PRIMARY KEY (id);


--
-- Name: tarefa_watchers tarefa_watchers_tarefa_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_watchers
    ADD CONSTRAINT tarefa_watchers_tarefa_id_user_id_key UNIQUE (tarefa_id, user_id);


--
-- Name: tarefa_whiteboard_origin tarefa_whiteboard_origin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_whiteboard_origin
    ADD CONSTRAINT tarefa_whiteboard_origin_pkey PRIMARY KEY (id);


--
-- Name: tarefa_whiteboard_origin tarefa_whiteboard_origin_tarefa_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_whiteboard_origin
    ADD CONSTRAINT tarefa_whiteboard_origin_tarefa_id_key UNIQUE (tarefa_id);


--
-- Name: tarefas tarefas_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_key_key UNIQUE (key);


--
-- Name: tarefas tarefas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: whiteboard_collaborators whiteboard_collaborators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whiteboard_collaborators
    ADD CONSTRAINT whiteboard_collaborators_pkey PRIMARY KEY (id);


--
-- Name: whiteboard_collaborators whiteboard_collaborators_whiteboard_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whiteboard_collaborators
    ADD CONSTRAINT whiteboard_collaborators_whiteboard_id_user_id_key UNIQUE (whiteboard_id, user_id);


--
-- Name: whiteboard_comments whiteboard_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whiteboard_comments
    ADD CONSTRAINT whiteboard_comments_pkey PRIMARY KEY (id);


--
-- Name: whiteboard_objects whiteboard_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whiteboard_objects
    ADD CONSTRAINT whiteboard_objects_pkey PRIMARY KEY (id);


--
-- Name: whiteboards whiteboards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whiteboards
    ADD CONSTRAINT whiteboards_pkey PRIMARY KEY (id);


--
-- Name: workflow_statuses workflow_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_statuses
    ADD CONSTRAINT workflow_statuses_pkey PRIMARY KEY (id);


--
-- Name: workflow_transitions workflow_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_transitions
    ADD CONSTRAINT workflow_transitions_pkey PRIMARY KEY (id);


--
-- Name: workflow_transitions workflow_transitions_workflow_id_from_status_id_to_status_i_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_transitions
    ADD CONSTRAINT workflow_transitions_workflow_id_from_status_id_to_status_i_key UNIQUE (workflow_id, from_status_id, to_status_id);


--
-- Name: workflows workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);


--
-- Name: idx_boards_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_boards_project_id ON public.boards USING btree (project_id);


--
-- Name: idx_tarefa_activity_log_tarefa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarefa_activity_log_tarefa_id ON public.tarefa_activity_log USING btree (tarefa_id);


--
-- Name: idx_tarefa_comments_tarefa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarefa_comments_tarefa_id ON public.tarefa_comments USING btree (tarefa_id);


--
-- Name: idx_tarefas_assignee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarefas_assignee_id ON public.tarefas USING btree (assignee_id);


--
-- Name: idx_tarefas_board_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarefas_board_id ON public.tarefas USING btree (board_id);


--
-- Name: idx_tarefas_epic_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarefas_epic_id ON public.tarefas USING btree (epic_id);


--
-- Name: idx_tarefas_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarefas_project_id ON public.tarefas USING btree (project_id);


--
-- Name: idx_tarefas_sprint_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarefas_sprint_id ON public.tarefas USING btree (sprint_id);


--
-- Name: idx_tarefas_status_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarefas_status_id ON public.tarefas USING btree (status_id);


--
-- Name: idx_whiteboard_objects_whiteboard; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whiteboard_objects_whiteboard ON public.whiteboard_objects USING btree (whiteboard_id);


--
-- Name: idx_whiteboard_objects_zindex; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whiteboard_objects_zindex ON public.whiteboard_objects USING btree (whiteboard_id, z_index);


--
-- Name: idx_whiteboards_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whiteboards_parent ON public.whiteboards USING btree (parent_branch_id);


--
-- Name: idx_whiteboards_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whiteboards_project ON public.whiteboards USING btree (project_id);


--
-- Name: idx_workflow_statuses_workflow_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_statuses_workflow_id ON public.workflow_statuses USING btree (workflow_id);


--
-- Name: idx_workflows_board_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflows_board_id ON public.workflows USING btree (board_id);


--
-- Name: boards update_boards_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_boards_updated_at BEFORE UPDATE ON public.boards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: projects update_projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sprints update_sprints_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_sprints_updated_at BEFORE UPDATE ON public.sprints FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tarefa_comments update_tarefa_comments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tarefa_comments_updated_at BEFORE UPDATE ON public.tarefa_comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tarefas update_tarefas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tarefas_updated_at BEFORE UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whiteboard_objects update_whiteboard_objects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whiteboard_objects_updated_at BEFORE UPDATE ON public.whiteboard_objects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whiteboards update_whiteboards_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whiteboards_updated_at BEFORE UPDATE ON public.whiteboards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: workflows update_workflows_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON public.workflows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: boards boards_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boards
    ADD CONSTRAINT boards_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: boards boards_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boards
    ADD CONSTRAINT boards_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: mentions mentions_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentions
    ADD CONSTRAINT mentions_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.whiteboard_comments(id) ON DELETE CASCADE;


--
-- Name: mentions mentions_mentioned_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentions
    ADD CONSTRAINT mentions_mentioned_user_id_profiles_fkey FOREIGN KEY (mentioned_user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_members project_members_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_members project_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_sequences project_sequences_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sequences
    ADD CONSTRAINT project_sequences_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: projects projects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: sprints sprints_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprints
    ADD CONSTRAINT sprints_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE SET NULL;


--
-- Name: sprints sprints_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprints
    ADD CONSTRAINT sprints_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: sprints sprints_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprints
    ADD CONSTRAINT sprints_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: tarefa_activity_log tarefa_activity_log_tarefa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_activity_log
    ADD CONSTRAINT tarefa_activity_log_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;


--
-- Name: tarefa_activity_log tarefa_activity_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_activity_log
    ADD CONSTRAINT tarefa_activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: tarefa_comments tarefa_comments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_comments
    ADD CONSTRAINT tarefa_comments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: tarefa_comments tarefa_comments_tarefa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_comments
    ADD CONSTRAINT tarefa_comments_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;


--
-- Name: tarefa_git_links tarefa_git_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_git_links
    ADD CONSTRAINT tarefa_git_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: tarefa_git_links tarefa_git_links_tarefa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_git_links
    ADD CONSTRAINT tarefa_git_links_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;


--
-- Name: tarefa_links tarefa_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_links
    ADD CONSTRAINT tarefa_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: tarefa_links tarefa_links_source_tarefa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_links
    ADD CONSTRAINT tarefa_links_source_tarefa_id_fkey FOREIGN KEY (source_tarefa_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;


--
-- Name: tarefa_links tarefa_links_target_tarefa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_links
    ADD CONSTRAINT tarefa_links_target_tarefa_id_fkey FOREIGN KEY (target_tarefa_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;


--
-- Name: tarefa_watchers tarefa_watchers_tarefa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_watchers
    ADD CONSTRAINT tarefa_watchers_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;


--
-- Name: tarefa_watchers tarefa_watchers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_watchers
    ADD CONSTRAINT tarefa_watchers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: tarefa_whiteboard_origin tarefa_whiteboard_origin_tarefa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_whiteboard_origin
    ADD CONSTRAINT tarefa_whiteboard_origin_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;


--
-- Name: tarefa_whiteboard_origin tarefa_whiteboard_origin_whiteboard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_whiteboard_origin
    ADD CONSTRAINT tarefa_whiteboard_origin_whiteboard_id_fkey FOREIGN KEY (whiteboard_id) REFERENCES public.whiteboards(id) ON DELETE CASCADE;


--
-- Name: tarefas tarefas_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES auth.users(id);


--
-- Name: tarefas tarefas_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE SET NULL;


--
-- Name: tarefas tarefas_epic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_epic_id_fkey FOREIGN KEY (epic_id) REFERENCES public.tarefas(id) ON DELETE SET NULL;


--
-- Name: tarefas tarefas_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;


--
-- Name: tarefas tarefas_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: tarefas tarefas_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id);


--
-- Name: tarefas tarefas_sprint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_sprint_id_fkey FOREIGN KEY (sprint_id) REFERENCES public.sprints(id) ON DELETE SET NULL;


--
-- Name: tarefas tarefas_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.workflow_statuses(id);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: whiteboard_collaborators whiteboard_collaborators_whiteboard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whiteboard_collaborators
    ADD CONSTRAINT whiteboard_collaborators_whiteboard_id_fkey FOREIGN KEY (whiteboard_id) REFERENCES public.whiteboards(id) ON DELETE CASCADE;


--
-- Name: whiteboard_comments whiteboard_comments_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whiteboard_comments
    ADD CONSTRAINT whiteboard_comments_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.whiteboard_objects(id) ON DELETE CASCADE;


--
-- Name: whiteboard_comments whiteboard_comments_parent_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whiteboard_comments
    ADD CONSTRAINT whiteboard_comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES public.whiteboard_comments(id) ON DELETE CASCADE;


--
-- Name: whiteboard_comments whiteboard_comments_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whiteboard_comments
    ADD CONSTRAINT whiteboard_comments_user_id_profiles_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;


--
-- Name: whiteboard_comments whiteboard_comments_whiteboard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whiteboard_comments
    ADD CONSTRAINT whiteboard_comments_whiteboard_id_fkey FOREIGN KEY (whiteboard_id) REFERENCES public.whiteboards(id) ON DELETE CASCADE;


--
-- Name: whiteboard_objects whiteboard_objects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whiteboard_objects
    ADD CONSTRAINT whiteboard_objects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: whiteboard_objects whiteboard_objects_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whiteboard_objects
    ADD CONSTRAINT whiteboard_objects_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.whiteboard_objects(id) ON DELETE SET NULL;


--
-- Name: whiteboard_objects whiteboard_objects_whiteboard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whiteboard_objects
    ADD CONSTRAINT whiteboard_objects_whiteboard_id_fkey FOREIGN KEY (whiteboard_id) REFERENCES public.whiteboards(id) ON DELETE CASCADE;


--
-- Name: whiteboards whiteboards_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whiteboards
    ADD CONSTRAINT whiteboards_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: whiteboards whiteboards_parent_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whiteboards
    ADD CONSTRAINT whiteboards_parent_branch_id_fkey FOREIGN KEY (parent_branch_id) REFERENCES public.whiteboards(id) ON DELETE SET NULL;


--
-- Name: whiteboards whiteboards_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whiteboards
    ADD CONSTRAINT whiteboards_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: workflow_statuses workflow_statuses_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_statuses
    ADD CONSTRAINT workflow_statuses_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;


--
-- Name: workflow_transitions workflow_transitions_from_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_transitions
    ADD CONSTRAINT workflow_transitions_from_status_id_fkey FOREIGN KEY (from_status_id) REFERENCES public.workflow_statuses(id) ON DELETE CASCADE;


--
-- Name: workflow_transitions workflow_transitions_to_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_transitions
    ADD CONSTRAINT workflow_transitions_to_status_id_fkey FOREIGN KEY (to_status_id) REFERENCES public.workflow_statuses(id) ON DELETE CASCADE;


--
-- Name: workflow_transitions workflow_transitions_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_transitions
    ADD CONSTRAINT workflow_transitions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;


--
-- Name: workflows workflows_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;


--
-- Name: whiteboards Admins and tech leads can delete whiteboards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and tech leads can delete whiteboards" ON public.whiteboards FOR DELETE USING ((public.get_project_role(auth.uid(), project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role])));


--
-- Name: projects Admins and tech leads can update projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and tech leads can update projects" ON public.projects FOR UPDATE TO authenticated USING ((public.get_project_role(auth.uid(), id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role])));


--
-- Name: boards Admins can delete boards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete boards" ON public.boards FOR DELETE USING ((public.get_project_role(auth.uid(), project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role])));


--
-- Name: project_members Admins can delete project members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete project members" ON public.project_members FOR DELETE TO authenticated USING ((public.get_project_role(auth.uid(), project_id) = 'admin'::public.app_role));


--
-- Name: sprints Admins can delete sprints; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete sprints" ON public.sprints FOR DELETE USING ((public.get_project_role(auth.uid(), project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role])));


--
-- Name: workflow_statuses Admins can delete statuses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete statuses" ON public.workflow_statuses FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.boards b ON ((b.id = w.board_id)))
  WHERE ((w.id = workflow_statuses.workflow_id) AND (public.get_project_role(auth.uid(), b.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role]))))));


--
-- Name: tarefas Admins can delete tarefas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete tarefas" ON public.tarefas FOR DELETE USING ((public.get_project_role(auth.uid(), project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role])));


--
-- Name: workflow_transitions Admins can delete transitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete transitions" ON public.workflow_transitions FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.boards b ON ((b.id = w.board_id)))
  WHERE ((w.id = workflow_transitions.workflow_id) AND (public.get_project_role(auth.uid(), b.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role]))))));


--
-- Name: workflows Admins can delete workflows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete workflows" ON public.workflows FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.boards b
  WHERE ((b.id = workflows.board_id) AND (public.get_project_role(auth.uid(), b.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role]))))));


--
-- Name: workflow_statuses Admins can insert statuses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert statuses" ON public.workflow_statuses FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.boards b ON ((b.id = w.board_id)))
  WHERE ((w.id = workflow_statuses.workflow_id) AND (public.get_project_role(auth.uid(), b.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role]))))));


--
-- Name: workflow_transitions Admins can insert transitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert transitions" ON public.workflow_transitions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.boards b ON ((b.id = w.board_id)))
  WHERE ((w.id = workflow_transitions.workflow_id) AND (public.get_project_role(auth.uid(), b.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role]))))));


--
-- Name: workflows Admins can insert workflows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert workflows" ON public.workflows FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.boards b
  WHERE ((b.id = workflows.board_id) AND (public.get_project_role(auth.uid(), b.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role]))))));


--
-- Name: project_members Admins can manage project members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage project members" ON public.project_members FOR INSERT TO authenticated WITH CHECK (((public.get_project_role(auth.uid(), project_id) = 'admin'::public.app_role) OR (NOT (EXISTS ( SELECT 1
   FROM public.project_members project_members_1
  WHERE (project_members_1.project_id = project_members_1.project_id))))));


--
-- Name: project_members Admins can update project members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update project members" ON public.project_members FOR UPDATE TO authenticated USING ((public.get_project_role(auth.uid(), project_id) = 'admin'::public.app_role));


--
-- Name: workflow_statuses Admins can update statuses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update statuses" ON public.workflow_statuses FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.boards b ON ((b.id = w.board_id)))
  WHERE ((w.id = workflow_statuses.workflow_id) AND (public.get_project_role(auth.uid(), b.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role]))))));


--
-- Name: workflow_transitions Admins can update transitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update transitions" ON public.workflow_transitions FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.boards b ON ((b.id = w.board_id)))
  WHERE ((w.id = workflow_transitions.workflow_id) AND (public.get_project_role(auth.uid(), b.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role]))))));


--
-- Name: workflows Admins can update workflows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update workflows" ON public.workflows FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.boards b
  WHERE ((b.id = workflows.board_id) AND (public.get_project_role(auth.uid(), b.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role]))))));


--
-- Name: projects Authenticated users can create projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create projects" ON public.projects FOR INSERT TO authenticated WITH CHECK ((auth.uid() = created_by));


--
-- Name: tarefa_comments Authors can delete comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authors can delete comments" ON public.tarefa_comments FOR DELETE USING ((auth.uid() = created_by));


--
-- Name: tarefa_comments Authors can update comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authors can update comments" ON public.tarefa_comments FOR UPDATE USING ((auth.uid() = created_by));


--
-- Name: mentions Comment author can create mentions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Comment author can create mentions" ON public.mentions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.whiteboard_comments c
  WHERE ((c.id = mentions.comment_id) AND (c.user_id = auth.uid())))));


--
-- Name: boards Editors can create boards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can create boards" ON public.boards FOR INSERT WITH CHECK ((public.get_project_role(auth.uid(), project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role])));


--
-- Name: tarefa_comments Editors can create comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can create comments" ON public.tarefa_comments FOR INSERT WITH CHECK (((auth.uid() = created_by) AND (EXISTS ( SELECT 1
   FROM public.tarefas t
  WHERE ((t.id = tarefa_comments.tarefa_id) AND (public.get_project_role(auth.uid(), t.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role])))))));


--
-- Name: tarefa_git_links Editors can create git links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can create git links" ON public.tarefa_git_links FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tarefas t
  WHERE ((t.id = tarefa_git_links.tarefa_id) AND (public.get_project_role(auth.uid(), t.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role]))))));


--
-- Name: tarefa_links Editors can create links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can create links" ON public.tarefa_links FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tarefas t
  WHERE ((t.id = tarefa_links.source_tarefa_id) AND (public.get_project_role(auth.uid(), t.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role]))))));


--
-- Name: sprints Editors can create sprints; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can create sprints" ON public.sprints FOR INSERT WITH CHECK ((public.get_project_role(auth.uid(), project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role])));


--
-- Name: tarefas Editors can create tarefas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can create tarefas" ON public.tarefas FOR INSERT WITH CHECK ((public.get_project_role(auth.uid(), project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role])));


--
-- Name: whiteboard_objects Editors can create whiteboard objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can create whiteboard objects" ON public.whiteboard_objects FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.whiteboards w
  WHERE ((w.id = whiteboard_objects.whiteboard_id) AND (public.get_project_role(auth.uid(), w.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role]))))));


--
-- Name: tarefa_whiteboard_origin Editors can create whiteboard origin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can create whiteboard origin" ON public.tarefa_whiteboard_origin FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tarefas t
  WHERE ((t.id = tarefa_whiteboard_origin.tarefa_id) AND (public.get_project_role(auth.uid(), t.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role]))))));


--
-- Name: tarefa_git_links Editors can delete git links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can delete git links" ON public.tarefa_git_links FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.tarefas t
  WHERE ((t.id = tarefa_git_links.tarefa_id) AND (public.get_project_role(auth.uid(), t.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role]))))));


--
-- Name: tarefa_links Editors can delete links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can delete links" ON public.tarefa_links FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.tarefas t
  WHERE ((t.id = tarefa_links.source_tarefa_id) AND (public.get_project_role(auth.uid(), t.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role]))))));


--
-- Name: whiteboard_objects Editors can delete whiteboard objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can delete whiteboard objects" ON public.whiteboard_objects FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.whiteboards w
  WHERE ((w.id = whiteboard_objects.whiteboard_id) AND (public.get_project_role(auth.uid(), w.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role]))))));


--
-- Name: tarefa_whiteboard_origin Editors can delete whiteboard origin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can delete whiteboard origin" ON public.tarefa_whiteboard_origin FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.tarefas t
  WHERE ((t.id = tarefa_whiteboard_origin.tarefa_id) AND (public.get_project_role(auth.uid(), t.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role]))))));


--
-- Name: boards Editors can update boards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can update boards" ON public.boards FOR UPDATE USING ((public.get_project_role(auth.uid(), project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role])));


--
-- Name: tarefa_git_links Editors can update git links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can update git links" ON public.tarefa_git_links FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.tarefas t
  WHERE ((t.id = tarefa_git_links.tarefa_id) AND (public.get_project_role(auth.uid(), t.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role]))))));


--
-- Name: tarefa_links Editors can update links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can update links" ON public.tarefa_links FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.tarefas t
  WHERE ((t.id = tarefa_links.source_tarefa_id) AND (public.get_project_role(auth.uid(), t.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role]))))));


--
-- Name: sprints Editors can update sprints; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can update sprints" ON public.sprints FOR UPDATE USING ((public.get_project_role(auth.uid(), project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role])));


--
-- Name: tarefas Editors can update tarefas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can update tarefas" ON public.tarefas FOR UPDATE USING ((public.get_project_role(auth.uid(), project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role])));


--
-- Name: whiteboard_objects Editors can update whiteboard objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can update whiteboard objects" ON public.whiteboard_objects FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.whiteboards w
  WHERE ((w.id = whiteboard_objects.whiteboard_id) AND (public.get_project_role(auth.uid(), w.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role]))))));


--
-- Name: tarefa_whiteboard_origin Editors can update whiteboard origin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can update whiteboard origin" ON public.tarefa_whiteboard_origin FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.tarefas t
  WHERE ((t.id = tarefa_whiteboard_origin.tarefa_id) AND (public.get_project_role(auth.uid(), t.project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role]))))));


--
-- Name: whiteboards Editors can update whiteboards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors can update whiteboards" ON public.whiteboards FOR UPDATE USING ((public.get_project_role(auth.uid(), project_id) = ANY (ARRAY['admin'::public.app_role, 'tech_lead'::public.app_role, 'developer'::public.app_role])));


--
-- Name: whiteboards Members can create whiteboards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can create whiteboards" ON public.whiteboards FOR INSERT WITH CHECK ((public.is_project_member(auth.uid(), project_id) AND (auth.uid() = created_by)));


--
-- Name: project_sequences Members can manage sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can manage sequences" ON public.project_sequences USING (public.is_project_member(auth.uid(), project_id));


--
-- Name: tarefa_activity_log Members can view activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view activity" ON public.tarefa_activity_log FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tarefas t
  WHERE ((t.id = tarefa_activity_log.tarefa_id) AND public.is_project_member(auth.uid(), t.project_id)))));


--
-- Name: boards Members can view boards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view boards" ON public.boards FOR SELECT USING (public.is_project_member(auth.uid(), project_id));


--
-- Name: tarefa_comments Members can view comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view comments" ON public.tarefa_comments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tarefas t
  WHERE ((t.id = tarefa_comments.tarefa_id) AND public.is_project_member(auth.uid(), t.project_id)))));


--
-- Name: tarefa_git_links Members can view git links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view git links" ON public.tarefa_git_links FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tarefas t
  WHERE ((t.id = tarefa_git_links.tarefa_id) AND public.is_project_member(auth.uid(), t.project_id)))));


--
-- Name: tarefa_links Members can view links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view links" ON public.tarefa_links FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tarefas t
  WHERE ((t.id = tarefa_links.source_tarefa_id) AND public.is_project_member(auth.uid(), t.project_id)))));


--
-- Name: project_members Members can view project members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view project members" ON public.project_members FOR SELECT TO authenticated USING (public.is_project_member(auth.uid(), project_id));


--
-- Name: whiteboards Members can view project whiteboards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view project whiteboards" ON public.whiteboards FOR SELECT USING (public.is_project_member(auth.uid(), project_id));


--
-- Name: sprints Members can view sprints; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view sprints" ON public.sprints FOR SELECT USING (public.is_project_member(auth.uid(), project_id));


--
-- Name: workflow_statuses Members can view statuses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view statuses" ON public.workflow_statuses FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.boards b ON ((b.id = w.board_id)))
  WHERE ((w.id = workflow_statuses.workflow_id) AND public.is_project_member(auth.uid(), b.project_id)))));


--
-- Name: tarefas Members can view tarefas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view tarefas" ON public.tarefas FOR SELECT USING (public.is_project_member(auth.uid(), project_id));


--
-- Name: projects Members can view their projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view their projects" ON public.projects FOR SELECT TO authenticated USING ((public.is_project_member(auth.uid(), id) OR (created_by = auth.uid())));


--
-- Name: workflow_transitions Members can view transitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view transitions" ON public.workflow_transitions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.boards b ON ((b.id = w.board_id)))
  WHERE ((w.id = workflow_transitions.workflow_id) AND public.is_project_member(auth.uid(), b.project_id)))));


--
-- Name: tarefa_watchers Members can view watchers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view watchers" ON public.tarefa_watchers FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tarefas t
  WHERE ((t.id = tarefa_watchers.tarefa_id) AND public.is_project_member(auth.uid(), t.project_id)))));


--
-- Name: whiteboard_objects Members can view whiteboard objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view whiteboard objects" ON public.whiteboard_objects FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.whiteboards w
  WHERE ((w.id = whiteboard_objects.whiteboard_id) AND public.is_project_member(auth.uid(), w.project_id)))));


--
-- Name: tarefa_whiteboard_origin Members can view whiteboard origin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view whiteboard origin" ON public.tarefa_whiteboard_origin FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tarefas t
  WHERE ((t.id = tarefa_whiteboard_origin.tarefa_id) AND public.is_project_member(auth.uid(), t.project_id)))));


--
-- Name: workflows Members can view workflows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view workflows" ON public.workflows FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.boards b
  WHERE ((b.id = workflows.board_id) AND public.is_project_member(auth.uid(), b.project_id)))));


--
-- Name: projects Only admins can delete projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can delete projects" ON public.projects FOR DELETE TO authenticated USING ((public.get_project_role(auth.uid(), id) = 'admin'::public.app_role));


--
-- Name: whiteboard_comments Project members can create comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Project members can create comments" ON public.whiteboard_comments FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (public.whiteboards w
     JOIN public.project_members pm ON ((pm.project_id = w.project_id)))
  WHERE ((w.id = whiteboard_comments.whiteboard_id) AND (pm.user_id = auth.uid()))))));


--
-- Name: whiteboard_collaborators Project members can view collaborators; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Project members can view collaborators" ON public.whiteboard_collaborators FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.whiteboards w
     JOIN public.project_members pm ON ((pm.project_id = w.project_id)))
  WHERE ((w.id = whiteboard_collaborators.whiteboard_id) AND (pm.user_id = auth.uid())))));


--
-- Name: whiteboard_comments Project members can view comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Project members can view comments" ON public.whiteboard_comments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.whiteboards w
     JOIN public.project_members pm ON ((pm.project_id = w.project_id)))
  WHERE ((w.id = whiteboard_comments.whiteboard_id) AND (pm.user_id = auth.uid())))));


--
-- Name: tarefa_activity_log System can create activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can create activity" ON public.tarefa_activity_log FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tarefas t
  WHERE ((t.id = tarefa_activity_log.tarefa_id) AND public.is_project_member(auth.uid(), t.project_id)))));


--
-- Name: tarefa_watchers Users can add themselves as watchers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can add themselves as watchers" ON public.tarefa_watchers FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: whiteboard_comments Users can delete their own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own comments" ON public.whiteboard_comments FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: whiteboard_collaborators Users can delete their own presence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own presence" ON public.whiteboard_collaborators FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: whiteboard_collaborators Users can insert their own presence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own presence" ON public.whiteboard_collaborators FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: mentions Users can mark their mentions as read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can mark their mentions as read" ON public.mentions FOR UPDATE USING ((mentioned_user_id = auth.uid()));


--
-- Name: tarefa_watchers Users can remove themselves as watchers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can remove themselves as watchers" ON public.tarefa_watchers FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: whiteboard_comments Users can update their own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own comments" ON public.whiteboard_comments FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: whiteboard_collaborators Users can update their own presence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own presence" ON public.whiteboard_collaborators FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: profiles Users can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: mentions Users can view their own mentions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own mentions" ON public.mentions FOR SELECT USING ((mentioned_user_id = auth.uid()));


--
-- Name: boards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;

--
-- Name: mentions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: project_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

--
-- Name: project_sequences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: sprints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;

--
-- Name: tarefa_activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tarefa_activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: tarefa_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tarefa_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: tarefa_git_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tarefa_git_links ENABLE ROW LEVEL SECURITY;

--
-- Name: tarefa_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tarefa_links ENABLE ROW LEVEL SECURITY;

--
-- Name: tarefa_watchers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tarefa_watchers ENABLE ROW LEVEL SECURITY;

--
-- Name: tarefa_whiteboard_origin; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tarefa_whiteboard_origin ENABLE ROW LEVEL SECURITY;

--
-- Name: tarefas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: whiteboard_collaborators; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whiteboard_collaborators ENABLE ROW LEVEL SECURITY;

--
-- Name: whiteboard_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whiteboard_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: whiteboard_objects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whiteboard_objects ENABLE ROW LEVEL SECURITY;

--
-- Name: whiteboards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whiteboards ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_statuses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflow_statuses ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_transitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflow_transitions ENABLE ROW LEVEL SECURITY;

--
-- Name: workflows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


