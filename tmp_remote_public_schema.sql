--
-- PostgreSQL database dump
--

-- \restrict 8HQlrd3btN5hTjhJqJa6aCHc8nQBn8mzEPh5tcAmU5Kb61yrk9ZGfXvR3PqMncW

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'tech_lead',
    'developer',
    'viewer'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";

--
-- Name: audit_action; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."audit_action" AS ENUM (
    'CONNECT',
    'CREATE_PR',
    'REVIEW',
    'MERGE',
    'RULE_CHANGE',
    'SYNC'
);


ALTER TYPE "public"."audit_action" OWNER TO "postgres";

--
-- Name: board_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."board_type" AS ENUM (
    'KANBAN',
    'SCRUM'
);


ALTER TYPE "public"."board_type" OWNER TO "postgres";

--
-- Name: check_conclusion; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."check_conclusion" AS ENUM (
    'SUCCESS',
    'FAILURE',
    'PENDING',
    'CANCELLED'
);


ALTER TYPE "public"."check_conclusion" OWNER TO "postgres";

--
-- Name: comment_side; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."comment_side" AS ENUM (
    'LEFT',
    'RIGHT'
);


ALTER TYPE "public"."comment_side" OWNER TO "postgres";

--
-- Name: connection_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."connection_status" AS ENUM (
    'active',
    'error',
    'revoked'
);


ALTER TYPE "public"."connection_status" OWNER TO "postgres";

--
-- Name: git_provider; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."git_provider" AS ENUM (
    'github',
    'bitbucket'
);


ALTER TYPE "public"."git_provider" OWNER TO "postgres";

--
-- Name: issue_link_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."issue_link_type" AS ENUM (
    'BLOCKS',
    'IS_BLOCKED_BY',
    'RELATES'
);


ALTER TYPE "public"."issue_link_type" OWNER TO "postgres";

--
-- Name: merge_method; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."merge_method" AS ENUM (
    'MERGE',
    'SQUASH',
    'REBASE'
);


ALTER TYPE "public"."merge_method" OWNER TO "postgres";

--
-- Name: pr_state; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."pr_state" AS ENUM (
    'OPEN',
    'MERGED',
    'CLOSED'
);


ALTER TYPE "public"."pr_state" OWNER TO "postgres";

--
-- Name: review_state; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."review_state" AS ENUM (
    'APPROVED',
    'CHANGES_REQUESTED',
    'COMMENTED'
);


ALTER TYPE "public"."review_state" OWNER TO "postgres";

--
-- Name: sprint_state; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."sprint_state" AS ENUM (
    'PLANNED',
    'ACTIVE',
    'DONE'
);


ALTER TYPE "public"."sprint_state" OWNER TO "postgres";

--
-- Name: tarefa_priority; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."tarefa_priority" AS ENUM (
    'LOWEST',
    'LOW',
    'MEDIUM',
    'HIGH',
    'HIGHEST'
);


ALTER TYPE "public"."tarefa_priority" OWNER TO "postgres";

--
-- Name: tarefa_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."tarefa_type" AS ENUM (
    'EPIC',
    'TASK',
    'SUBTASK',
    'BUG',
    'STORY'
);


ALTER TYPE "public"."tarefa_type" OWNER TO "postgres";

--
-- Name: auto_link_branch_tarefas(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."auto_link_branch_tarefas"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_project_id uuid;
BEGIN
    -- Obter project_id do repo
    SELECT project_id INTO v_project_id
    FROM public.repos
    WHERE id = NEW.repo_id;
    
    IF v_project_id IS NOT NULL THEN
        -- Detectar TSK-123 no nome da branch
        PERFORM public.detect_and_link_tarefas(
            NEW.name,
            NEW.repo_id,
            v_project_id,
            'branch',
            NEW.id,
            NEW.name,
            NULL,
            NULL
        );
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_link_branch_tarefas"() OWNER TO "postgres";

--
-- Name: auto_link_commit_tarefas(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."auto_link_commit_tarefas"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_project_id uuid;
BEGIN
    -- Obter project_id do repo
    SELECT project_id INTO v_project_id
    FROM public.repos
    WHERE id = NEW.repo_id;
    
    IF v_project_id IS NOT NULL THEN
        -- Detectar TSK-123 na mensagem do commit
        PERFORM public.detect_and_link_tarefas(
            NEW.message,
            NEW.repo_id,
            v_project_id,
            'commit',
            NEW.id,
            NEW.branch_name,
            NEW.sha,
            NULL
        );
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_link_commit_tarefas"() OWNER TO "postgres";

--
-- Name: auto_link_pr_tarefas(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."auto_link_pr_tarefas"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_project_id uuid;
    v_text_to_search text;
BEGIN
    -- Obter project_id do repo
    SELECT project_id INTO v_project_id
    FROM public.repos
    WHERE id = NEW.repo_id;
    
    IF v_project_id IS NOT NULL THEN
        -- Combinar título, descrição e branch para busca
        v_text_to_search := COALESCE(NEW.title, '') || ' ' || 
                           COALESCE(NEW.description, '') || ' ' || 
                           COALESCE(NEW.source_branch, '');
        
        -- Detectar TSK-123
        PERFORM public.detect_and_link_tarefas(
            v_text_to_search,
            NEW.repo_id,
            v_project_id,
            'pull_request',
            NEW.id,
            NEW.source_branch,
            NULL,
            NEW.number
        );
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_link_pr_tarefas"() OWNER TO "postgres";

--
-- Name: bump_whiteboard_snapshot_version(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."bump_whiteboard_snapshot_version"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only bump when the snapshot actually changes (NULL-safe)
  IF (NEW.canvas_snapshot IS DISTINCT FROM OLD.canvas_snapshot) THEN
    NEW.snapshot_version := COALESCE(OLD.snapshot_version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."bump_whiteboard_snapshot_version"() OWNER TO "postgres";

--
-- Name: can_merge_pr("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."can_merge_pr"("p_user_id" "uuid", "p_pr_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_project_id uuid;
    v_user_role public.app_role;
BEGIN
    -- Obter project_id do PR
    SELECT get_repo_project(r.id) INTO v_project_id
    FROM pull_requests pr
    JOIN repos r ON r.id = pr.repo_id
    WHERE pr.id = p_pr_id;
    
    IF v_project_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Verificar role do usuário
    SELECT role INTO v_user_role
    FROM project_members
    WHERE user_id = p_user_id AND project_id = v_project_id;
    
    -- Apenas admin e tech_lead podem fazer merge
    RETURN v_user_role IN ('admin', 'tech_lead');
END;
$$;


ALTER FUNCTION "public"."can_merge_pr"("p_user_id" "uuid", "p_pr_id" "uuid") OWNER TO "postgres";

--
-- Name: cleanup_expired_oauth_states(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."cleanup_expired_oauth_states"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    DELETE FROM public.github_oauth_states
    WHERE expires_at < now();
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_oauth_states"() OWNER TO "postgres";

--
-- Name: create_default_workflow("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."create_default_workflow"("p_board_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."create_default_workflow"("p_board_id" "uuid") OWNER TO "postgres";

--
-- Name: create_whiteboard_branch("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."create_whiteboard_branch"("source_whiteboard_id" "uuid", "branch_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  source_whiteboard public.whiteboards%ROWTYPE;
  new_whiteboard_id uuid;
BEGIN
  SELECT * INTO source_whiteboard FROM public.whiteboards WHERE id = source_whiteboard_id;

  IF source_whiteboard IS NULL THEN
    RAISE EXCEPTION 'Whiteboard not found';
  END IF;

  INSERT INTO public.whiteboards (
    project_id,
    name,
    branch_name,
    parent_branch_id,
    viewport,
    settings,
    created_by,
    branch_metadata,
    canvas_snapshot,
    snapshot_version
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
    ),
    source_whiteboard.canvas_snapshot,
    0
  )
  RETURNING id INTO new_whiteboard_id;

  RETURN new_whiteboard_id;
END;
$$;


ALTER FUNCTION "public"."create_whiteboard_branch"("source_whiteboard_id" "uuid", "branch_name" "text") OWNER TO "postgres";

--
-- Name: detect_and_link_tarefas("text", "uuid", "uuid", "text", "uuid", "text", "text", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."detect_and_link_tarefas"("p_text" "text", "p_repo_id" "uuid", "p_project_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_branch_name" "text" DEFAULT NULL::"text", "p_commit_sha" "text" DEFAULT NULL::"text", "p_pr_number" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_match text;
    v_tarefa_key text;
    v_tarefa_id uuid;
BEGIN
    -- Regex para encontrar TSK-123 ou TSK-ABC-123
    -- Padrão: TSK- seguido de números ou letras-números
    FOR v_match IN 
        SELECT regexp_matches(p_text, 'TSK-([A-Z0-9]+(?:-[A-Z0-9]+)*)', 'gi')
    LOOP
        -- Extrair a chave da tarefa (TSK-123)
        v_tarefa_key := 'TSK-' || (v_match)[1];
        
        -- Buscar tarefa pelo key no projeto
        SELECT id INTO v_tarefa_id
        FROM public.tarefas
        WHERE project_id = p_project_id
        AND key = v_tarefa_key
        LIMIT 1;
        
        -- Se encontrou a tarefa, criar link se não existir
        IF v_tarefa_id IS NOT NULL THEN
            INSERT INTO public.tarefa_git_links (
                tarefa_id,
                provider,
                branch,
                commit_sha,
                pr_number,
                metadata
            )
            VALUES (
                v_tarefa_id,
                'github',
                p_branch_name,
                p_commit_sha,
                p_pr_number,
                jsonb_build_object(
                    'entity_type', p_entity_type,
                    'entity_id', p_entity_id,
                    'auto_linked', true,
                    'detected_from', p_text
                )
            )
            ON CONFLICT DO NOTHING; -- Evita duplicatas
        END IF;
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."detect_and_link_tarefas"("p_text" "text", "p_repo_id" "uuid", "p_project_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_branch_name" "text", "p_commit_sha" "text", "p_pr_number" integer) OWNER TO "postgres";

--
-- Name: generate_tarefa_key("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."generate_tarefa_key"("p_project_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."generate_tarefa_key"("p_project_id" "uuid") OWNER TO "postgres";

--
-- Name: get_pr_review_status("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_pr_review_status"("p_pr_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT jsonb_build_object(
        'total_reviews', COUNT(*),
        'approved', COUNT(*) FILTER (WHERE state = 'APPROVED'),
        'changes_requested', COUNT(*) FILTER (WHERE state = 'CHANGES_REQUESTED'),
        'commented', COUNT(*) FILTER (WHERE state = 'COMMENTED')
    )
    FROM pr_reviews
    WHERE pr_id = p_pr_id;
$$;


ALTER FUNCTION "public"."get_pr_review_status"("p_pr_id" "uuid") OWNER TO "postgres";

--
-- Name: get_project_role("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_project_role"("_user_id" "uuid", "_project_id" "uuid") RETURNS "public"."app_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role
  FROM public.project_members
  WHERE user_id = _user_id
    AND project_id = _project_id
$$;


ALTER FUNCTION "public"."get_project_role"("_user_id" "uuid", "_project_id" "uuid") OWNER TO "postgres";

--
-- Name: get_repo_project("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_repo_project"("p_repo_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT project_id
    FROM project_repos
    WHERE repo_id = p_repo_id
    LIMIT 1;
$$;


ALTER FUNCTION "public"."get_repo_project"("p_repo_id" "uuid") OWNER TO "postgres";

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (
    NEW.id, 
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      SPLIT_PART(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

--
-- Name: has_role("uuid", "public"."app_role"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";

--
-- Name: is_project_member("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_project_member"("_user_id" "uuid", "_project_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE user_id = _user_id
      AND project_id = _project_id
  )
$$;


ALTER FUNCTION "public"."is_project_member"("_user_id" "uuid", "_project_id" "uuid") OWNER TO "postgres";

--
-- Name: merge_whiteboard_branch("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."merge_whiteboard_branch"("branch_whiteboard_id" "uuid", "target_whiteboard_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  branch_row public.whiteboards%ROWTYPE;
BEGIN
  -- Verify relationship: branch must point to target as parent
  IF NOT EXISTS (
    SELECT 1
    FROM public.whiteboards
    WHERE id = branch_whiteboard_id
      AND parent_branch_id = target_whiteboard_id
  ) THEN
    RAISE EXCEPTION 'Invalid branch relationship';
  END IF;

  SELECT * INTO branch_row FROM public.whiteboards WHERE id = branch_whiteboard_id;
  IF branch_row IS NULL THEN
    RAISE EXCEPTION 'Branch whiteboard not found';
  END IF;

  -- Last-write-wins: overwrite target snapshot with branch snapshot
  UPDATE public.whiteboards
  SET
    canvas_snapshot = branch_row.canvas_snapshot,
    viewport = branch_row.viewport,
    settings = branch_row.settings,
    updated_at = now()
  WHERE id = target_whiteboard_id;

  -- Update branch metadata
  UPDATE public.whiteboards
  SET branch_metadata = COALESCE(branch_metadata, '{}'::jsonb) || jsonb_build_object(
    'merged_at', now(),
    'merged_to', target_whiteboard_id
  )
  WHERE id = branch_whiteboard_id;

  RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."merge_whiteboard_branch"("branch_whiteboard_id" "uuid", "target_whiteboard_id" "uuid") OWNER TO "postgres";

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: audit_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "action" "public"."audit_action" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "before" "jsonb",
    "after" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_events" OWNER TO "postgres";

--
-- Name: boards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."boards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "type" "public"."board_type" DEFAULT 'KANBAN'::"public"."board_type" NOT NULL,
    "is_favorite" boolean DEFAULT false,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."boards" OWNER TO "postgres";

--
-- Name: branches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."branches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "repo_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "last_commit_sha" "text",
    "is_default" boolean DEFAULT false,
    "protected" boolean DEFAULT false,
    "ahead_count" integer DEFAULT 0,
    "behind_count" integer DEFAULT 0,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."branches" OWNER TO "postgres";

--
-- Name: commits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."commits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "repo_id" "uuid" NOT NULL,
    "sha" "text" NOT NULL,
    "branch_name" "text",
    "author_name" "text" NOT NULL,
    "author_email" "text",
    "message" "text" NOT NULL,
    "date" timestamp with time zone NOT NULL,
    "url" "text",
    "parent_shas" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."commits" OWNER TO "postgres";

--
-- Name: github_oauth_states; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."github_oauth_states" (
    "state" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:05:00'::interval) NOT NULL
);


ALTER TABLE "public"."github_oauth_states" OWNER TO "postgres";

--
-- Name: mentions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."mentions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "comment_id" "uuid" NOT NULL,
    "mentioned_user_id" "uuid" NOT NULL,
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."mentions" OWNER TO "postgres";

--
-- Name: pr_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pr_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pr_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "author_username" "text",
    "body" "text" NOT NULL,
    "line_number" integer,
    "path" "text",
    "side" "public"."comment_side",
    "in_reply_to_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pr_comments" OWNER TO "postgres";

--
-- Name: pr_reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pr_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pr_id" "uuid" NOT NULL,
    "reviewer_id" "uuid" NOT NULL,
    "reviewer_username" "text",
    "state" "public"."review_state" NOT NULL,
    "body" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pr_reviews" OWNER TO "postgres";

--
-- Name: pr_status_checks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pr_status_checks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pr_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "conclusion" "public"."check_conclusion" DEFAULT 'PENDING'::"public"."check_conclusion" NOT NULL,
    "details_url" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pr_status_checks" OWNER TO "postgres";

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";

--
-- Name: project_invites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."project_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."app_role" DEFAULT 'developer'::"public"."app_role" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "accepted_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_invites" OWNER TO "postgres";

--
-- Name: project_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."project_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" DEFAULT 'developer'::"public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_members" OWNER TO "postgres";

--
-- Name: project_repos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."project_repos" (
    "project_id" "uuid" NOT NULL,
    "repo_id" "uuid" NOT NULL,
    "branch_template" "text" DEFAULT 'feature/{taskKey}-{title}'::"text",
    "merge_policy" "public"."merge_method" DEFAULT 'MERGE'::"public"."merge_method",
    "min_reviews" integer DEFAULT 1,
    "require_checks" boolean DEFAULT false,
    "auto_close_tarefa_on_merge" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_repos" OWNER TO "postgres";

--
-- Name: project_sequences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."project_sequences" (
    "project_id" "uuid" NOT NULL,
    "last_sequence" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."project_sequences" OWNER TO "postgres";

--
-- Name: projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "slug" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."projects" OWNER TO "postgres";

--
-- Name: provider_connections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."provider_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "provider" "public"."git_provider" DEFAULT 'github'::"public"."git_provider" NOT NULL,
    "owner_type" "text" NOT NULL,
    "owner_name" "text" NOT NULL,
    "installation_id" "text",
    "workspace_id" "text",
    "status" "public"."connection_status" DEFAULT 'active'::"public"."connection_status" NOT NULL,
    "secrets_ref" "text",
    "last_sync_at" timestamp with time zone,
    "error_message" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "github_user_id" "text",
    "username" "text",
    "access_token_encrypted" "text",
    "scopes" "text"[] DEFAULT ARRAY[]::"text"[],
    CONSTRAINT "provider_connections_owner_type_check" CHECK (("owner_type" = ANY (ARRAY['user'::"text", 'org'::"text"])))
);


ALTER TABLE "public"."provider_connections" OWNER TO "postgres";

--
-- Name: pull_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pull_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "repo_id" "uuid" NOT NULL,
    "number" integer NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "state" "public"."pr_state" DEFAULT 'OPEN'::"public"."pr_state" NOT NULL,
    "source_branch" "text" NOT NULL,
    "target_branch" "text" DEFAULT 'main'::"text" NOT NULL,
    "author_id" "uuid",
    "author_username" "text",
    "draft" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "merged_at" timestamp with time zone,
    "merge_commit_sha" "text",
    "url" "text"
);


ALTER TABLE "public"."pull_requests" OWNER TO "postgres";

--
-- Name: repos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."repos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "connection_id" "uuid",
    "provider_repo_id" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "default_branch" "text" NOT NULL,
    "visibility" "text" NOT NULL,
    "description" "text",
    "url" "text",
    "last_synced_at" timestamp with time zone,
    "sync_status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "selected" boolean DEFAULT false,
    "project_id" "uuid",
    CONSTRAINT "repos_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'private'::"text", 'internal'::"text"])))
);


ALTER TABLE "public"."repos" OWNER TO "postgres";

--
-- Name: sprints; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."sprints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "board_id" "uuid",
    "name" "text" NOT NULL,
    "goal" "text",
    "start_date" "date",
    "end_date" "date",
    "state" "public"."sprint_state" DEFAULT 'PLANNED'::"public"."sprint_state" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sprints" OWNER TO "postgres";

--
-- Name: tarefa_activity_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."tarefa_activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tarefa_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "field_name" "text",
    "old_value" "text",
    "new_value" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tarefa_activity_log" OWNER TO "postgres";

--
-- Name: tarefa_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."tarefa_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tarefa_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tarefa_comments" OWNER TO "postgres";

--
-- Name: tarefa_git_links; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."tarefa_git_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tarefa_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'github'::"text" NOT NULL,
    "branch" "text",
    "commit_sha" "text",
    "pr_number" integer,
    "url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pr_id" "uuid",
    "commit_ids" "text"[] DEFAULT '{}'::"text"[]
);


ALTER TABLE "public"."tarefa_git_links" OWNER TO "postgres";

--
-- Name: tarefa_links; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."tarefa_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_tarefa_id" "uuid" NOT NULL,
    "target_tarefa_id" "uuid" NOT NULL,
    "link_type" "public"."issue_link_type" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tarefa_links" OWNER TO "postgres";

--
-- Name: tarefa_watchers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."tarefa_watchers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tarefa_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tarefa_watchers" OWNER TO "postgres";

--
-- Name: tarefa_whiteboard_origin; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."tarefa_whiteboard_origin" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tarefa_id" "uuid" NOT NULL,
    "whiteboard_id" "uuid" NOT NULL,
    "node_ids" "text"[] DEFAULT '{}'::"text"[],
    "area_bounds" "jsonb",
    "snapshot_title" "text",
    "snapshot_preview" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tarefa_whiteboard_origin" OWNER TO "postgres";

--
-- Name: tarefas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."tarefas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "board_id" "uuid",
    "key" "text" NOT NULL,
    "type" "public"."tarefa_type" DEFAULT 'TASK'::"public"."tarefa_type" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status_id" "uuid",
    "priority" "public"."tarefa_priority" DEFAULT 'MEDIUM'::"public"."tarefa_priority" NOT NULL,
    "assignee_id" "uuid",
    "reporter_id" "uuid",
    "parent_id" "uuid",
    "epic_id" "uuid",
    "sprint_id" "uuid",
    "labels" "text"[] DEFAULT '{}'::"text"[],
    "due_date" "date",
    "estimated_hours" numeric(10,2),
    "backlog_position" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tarefas" OWNER TO "postgres";

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";

--
-- Name: webhook_event_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."webhook_event_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "delivery_id" "text" NOT NULL,
    "signature_ok" boolean DEFAULT false,
    "processed_ok" boolean DEFAULT false,
    "error" "text",
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."webhook_event_logs" OWNER TO "postgres";

--
-- Name: whiteboard_collaborators; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."whiteboard_collaborators" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "whiteboard_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cursor_x" double precision,
    "cursor_y" double precision,
    "color" "text" DEFAULT '#3B82F6'::"text",
    "last_seen" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."whiteboard_collaborators" OWNER TO "postgres";

--
-- Name: whiteboard_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."whiteboard_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "whiteboard_id" "uuid" NOT NULL,
    "object_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "position_x" double precision,
    "position_y" double precision,
    "resolved" boolean DEFAULT false,
    "parent_comment_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."whiteboard_comments" OWNER TO "postgres";

--
-- Name: whiteboard_objects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."whiteboard_objects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "whiteboard_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "properties" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "z_index" integer DEFAULT 0,
    "locked" boolean DEFAULT false,
    "group_id" "uuid",
    "linked_task_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."whiteboard_objects" OWNER TO "postgres";

--
-- Name: whiteboards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."whiteboards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_by" "uuid",
    "parent_branch_id" "uuid",
    "branch_name" "text",
    "branch_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "viewport" "jsonb" DEFAULT '{"x": 0, "y": 0, "zoom": 1}'::"jsonb",
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "canvas_snapshot" "jsonb",
    "snapshot_version" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."whiteboards" OWNER TO "postgres";

--
-- Name: workflow_statuses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."workflow_statuses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#6B7280'::"text",
    "position" integer DEFAULT 0 NOT NULL,
    "is_initial" boolean DEFAULT false,
    "is_final" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workflow_statuses" OWNER TO "postgres";

--
-- Name: workflow_transitions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."workflow_transitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "from_status_id" "uuid" NOT NULL,
    "to_status_id" "uuid" NOT NULL,
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workflow_transitions" OWNER TO "postgres";

--
-- Name: workflows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."workflows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "board_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Default Workflow'::"text" NOT NULL,
    "is_default" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workflows" OWNER TO "postgres";

--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_events"
    ADD CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id");


--
-- Name: boards boards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."boards"
    ADD CONSTRAINT "boards_pkey" PRIMARY KEY ("id");


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_pkey" PRIMARY KEY ("id");


--
-- Name: branches branches_repo_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_repo_id_name_key" UNIQUE ("repo_id", "name");


--
-- Name: commits commits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."commits"
    ADD CONSTRAINT "commits_pkey" PRIMARY KEY ("id");


--
-- Name: commits commits_repo_id_sha_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."commits"
    ADD CONSTRAINT "commits_repo_id_sha_key" UNIQUE ("repo_id", "sha");


--
-- Name: github_oauth_states github_oauth_states_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."github_oauth_states"
    ADD CONSTRAINT "github_oauth_states_pkey" PRIMARY KEY ("state");


--
-- Name: mentions mentions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."mentions"
    ADD CONSTRAINT "mentions_pkey" PRIMARY KEY ("id");


--
-- Name: pr_comments pr_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pr_comments"
    ADD CONSTRAINT "pr_comments_pkey" PRIMARY KEY ("id");


--
-- Name: pr_reviews pr_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pr_reviews"
    ADD CONSTRAINT "pr_reviews_pkey" PRIMARY KEY ("id");


--
-- Name: pr_reviews pr_reviews_pr_id_reviewer_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pr_reviews"
    ADD CONSTRAINT "pr_reviews_pr_id_reviewer_id_key" UNIQUE ("pr_id", "reviewer_id");


--
-- Name: pr_status_checks pr_status_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pr_status_checks"
    ADD CONSTRAINT "pr_status_checks_pkey" PRIMARY KEY ("id");


--
-- Name: pr_status_checks pr_status_checks_pr_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pr_status_checks"
    ADD CONSTRAINT "pr_status_checks_pr_id_name_key" UNIQUE ("pr_id", "name");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");


--
-- Name: project_invites project_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."project_invites"
    ADD CONSTRAINT "project_invites_pkey" PRIMARY KEY ("id");


--
-- Name: project_invites project_invites_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."project_invites"
    ADD CONSTRAINT "project_invites_token_key" UNIQUE ("token");


--
-- Name: project_members project_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_pkey" PRIMARY KEY ("id");


--
-- Name: project_members project_members_project_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_user_id_key" UNIQUE ("project_id", "user_id");


--
-- Name: project_repos project_repos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."project_repos"
    ADD CONSTRAINT "project_repos_pkey" PRIMARY KEY ("project_id", "repo_id");


--
-- Name: project_sequences project_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."project_sequences"
    ADD CONSTRAINT "project_sequences_pkey" PRIMARY KEY ("project_id");


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");


--
-- Name: projects projects_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_slug_key" UNIQUE ("slug");


--
-- Name: provider_connections provider_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."provider_connections"
    ADD CONSTRAINT "provider_connections_pkey" PRIMARY KEY ("id");


--
-- Name: pull_requests pull_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pull_requests"
    ADD CONSTRAINT "pull_requests_pkey" PRIMARY KEY ("id");


--
-- Name: pull_requests pull_requests_repo_id_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pull_requests"
    ADD CONSTRAINT "pull_requests_repo_id_number_key" UNIQUE ("repo_id", "number");


--
-- Name: repos repos_connection_id_provider_repo_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."repos"
    ADD CONSTRAINT "repos_connection_id_provider_repo_id_key" UNIQUE ("connection_id", "provider_repo_id");


--
-- Name: repos repos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."repos"
    ADD CONSTRAINT "repos_pkey" PRIMARY KEY ("id");


--
-- Name: sprints sprints_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sprints"
    ADD CONSTRAINT "sprints_pkey" PRIMARY KEY ("id");


--
-- Name: tarefa_activity_log tarefa_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_activity_log"
    ADD CONSTRAINT "tarefa_activity_log_pkey" PRIMARY KEY ("id");


--
-- Name: tarefa_comments tarefa_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_comments"
    ADD CONSTRAINT "tarefa_comments_pkey" PRIMARY KEY ("id");


--
-- Name: tarefa_git_links tarefa_git_links_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_git_links"
    ADD CONSTRAINT "tarefa_git_links_pkey" PRIMARY KEY ("id");


--
-- Name: tarefa_links tarefa_links_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_links"
    ADD CONSTRAINT "tarefa_links_pkey" PRIMARY KEY ("id");


--
-- Name: tarefa_links tarefa_links_source_tarefa_id_target_tarefa_id_link_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_links"
    ADD CONSTRAINT "tarefa_links_source_tarefa_id_target_tarefa_id_link_type_key" UNIQUE ("source_tarefa_id", "target_tarefa_id", "link_type");


--
-- Name: tarefa_watchers tarefa_watchers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_watchers"
    ADD CONSTRAINT "tarefa_watchers_pkey" PRIMARY KEY ("id");


--
-- Name: tarefa_watchers tarefa_watchers_tarefa_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_watchers"
    ADD CONSTRAINT "tarefa_watchers_tarefa_id_user_id_key" UNIQUE ("tarefa_id", "user_id");


--
-- Name: tarefa_whiteboard_origin tarefa_whiteboard_origin_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_whiteboard_origin"
    ADD CONSTRAINT "tarefa_whiteboard_origin_pkey" PRIMARY KEY ("id");


--
-- Name: tarefa_whiteboard_origin tarefa_whiteboard_origin_tarefa_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_whiteboard_origin"
    ADD CONSTRAINT "tarefa_whiteboard_origin_tarefa_id_key" UNIQUE ("tarefa_id");


--
-- Name: tarefas tarefas_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_key_key" UNIQUE ("key");


--
-- Name: tarefas tarefas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id");


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");


--
-- Name: webhook_event_logs webhook_event_logs_delivery_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."webhook_event_logs"
    ADD CONSTRAINT "webhook_event_logs_delivery_id_key" UNIQUE ("delivery_id");


--
-- Name: webhook_event_logs webhook_event_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."webhook_event_logs"
    ADD CONSTRAINT "webhook_event_logs_pkey" PRIMARY KEY ("id");


--
-- Name: whiteboard_collaborators whiteboard_collaborators_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whiteboard_collaborators"
    ADD CONSTRAINT "whiteboard_collaborators_pkey" PRIMARY KEY ("id");


--
-- Name: whiteboard_collaborators whiteboard_collaborators_whiteboard_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whiteboard_collaborators"
    ADD CONSTRAINT "whiteboard_collaborators_whiteboard_id_user_id_key" UNIQUE ("whiteboard_id", "user_id");


--
-- Name: whiteboard_comments whiteboard_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whiteboard_comments"
    ADD CONSTRAINT "whiteboard_comments_pkey" PRIMARY KEY ("id");


--
-- Name: whiteboard_objects whiteboard_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whiteboard_objects"
    ADD CONSTRAINT "whiteboard_objects_pkey" PRIMARY KEY ("id");


--
-- Name: whiteboards whiteboards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whiteboards"
    ADD CONSTRAINT "whiteboards_pkey" PRIMARY KEY ("id");


--
-- Name: workflow_statuses workflow_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workflow_statuses"
    ADD CONSTRAINT "workflow_statuses_pkey" PRIMARY KEY ("id");


--
-- Name: workflow_transitions workflow_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workflow_transitions"
    ADD CONSTRAINT "workflow_transitions_pkey" PRIMARY KEY ("id");


--
-- Name: workflow_transitions workflow_transitions_workflow_id_from_status_id_to_status_i_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workflow_transitions"
    ADD CONSTRAINT "workflow_transitions_workflow_id_from_status_id_to_status_i_key" UNIQUE ("workflow_id", "from_status_id", "to_status_id");


--
-- Name: workflows workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_pkey" PRIMARY KEY ("id");


--
-- Name: idx_audit_events_actor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_events_actor" ON "public"."audit_events" USING "btree" ("actor_id");


--
-- Name: idx_audit_events_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_events_created" ON "public"."audit_events" USING "btree" ("created_at" DESC);


--
-- Name: idx_audit_events_entity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_events_entity" ON "public"."audit_events" USING "btree" ("entity_type", "entity_id");


--
-- Name: idx_boards_project_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_boards_project_id" ON "public"."boards" USING "btree" ("project_id");


--
-- Name: idx_branches_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_branches_name" ON "public"."branches" USING "btree" ("name");


--
-- Name: idx_branches_repo_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_branches_repo_id" ON "public"."branches" USING "btree" ("repo_id");


--
-- Name: idx_commits_branch; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_commits_branch" ON "public"."commits" USING "btree" ("repo_id", "branch_name");


--
-- Name: idx_commits_message_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_commits_message_gin" ON "public"."commits" USING "gin" ("to_tsvector"('"english"'::"regconfig", "message"));


--
-- Name: idx_commits_repo_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_commits_repo_id" ON "public"."commits" USING "btree" ("repo_id");


--
-- Name: idx_commits_sha; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_commits_sha" ON "public"."commits" USING "btree" ("sha");


--
-- Name: idx_github_oauth_states_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_github_oauth_states_expires" ON "public"."github_oauth_states" USING "btree" ("expires_at");


--
-- Name: idx_pr_comments_pr_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pr_comments_pr_id" ON "public"."pr_comments" USING "btree" ("pr_id");


--
-- Name: idx_pr_reviews_pr_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pr_reviews_pr_id" ON "public"."pr_reviews" USING "btree" ("pr_id");


--
-- Name: idx_pr_reviews_reviewer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pr_reviews_reviewer" ON "public"."pr_reviews" USING "btree" ("reviewer_id");


--
-- Name: idx_pr_status_checks_pr_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pr_status_checks_pr_id" ON "public"."pr_status_checks" USING "btree" ("pr_id");


--
-- Name: idx_project_invites_accepted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_project_invites_accepted_at" ON "public"."project_invites" USING "btree" ("accepted_at");


--
-- Name: idx_project_invites_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_project_invites_email" ON "public"."project_invites" USING "btree" ("email");


--
-- Name: idx_project_invites_project_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_project_invites_project_id" ON "public"."project_invites" USING "btree" ("project_id");


--
-- Name: idx_project_invites_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_project_invites_token" ON "public"."project_invites" USING "btree" ("token");


--
-- Name: idx_project_invites_unique_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_project_invites_unique_active" ON "public"."project_invites" USING "btree" ("project_id", "email") WHERE ("accepted_at" IS NULL);


--
-- Name: idx_project_repos_project; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_project_repos_project" ON "public"."project_repos" USING "btree" ("project_id");


--
-- Name: idx_project_repos_repo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_project_repos_repo" ON "public"."project_repos" USING "btree" ("repo_id");


--
-- Name: idx_pull_requests_author; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pull_requests_author" ON "public"."pull_requests" USING "btree" ("author_id");


--
-- Name: idx_pull_requests_repo_state; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pull_requests_repo_state" ON "public"."pull_requests" USING "btree" ("repo_id", "state");


--
-- Name: idx_pull_requests_state; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pull_requests_state" ON "public"."pull_requests" USING "btree" ("state");


--
-- Name: idx_repos_connection_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_repos_connection_id" ON "public"."repos" USING "btree" ("connection_id");


--
-- Name: idx_repos_full_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_repos_full_name" ON "public"."repos" USING "btree" ("full_name");


--
-- Name: idx_repos_project_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_repos_project_id" ON "public"."repos" USING "btree" ("project_id");


--
-- Name: idx_repos_selected; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_repos_selected" ON "public"."repos" USING "btree" ("selected");


--
-- Name: idx_tarefa_activity_log_tarefa_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tarefa_activity_log_tarefa_id" ON "public"."tarefa_activity_log" USING "btree" ("tarefa_id");


--
-- Name: idx_tarefa_comments_tarefa_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tarefa_comments_tarefa_id" ON "public"."tarefa_comments" USING "btree" ("tarefa_id");


--
-- Name: idx_tarefa_git_links_pr_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tarefa_git_links_pr_id" ON "public"."tarefa_git_links" USING "btree" ("pr_id");


--
-- Name: idx_tarefas_assignee_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tarefas_assignee_id" ON "public"."tarefas" USING "btree" ("assignee_id");


--
-- Name: idx_tarefas_board_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tarefas_board_id" ON "public"."tarefas" USING "btree" ("board_id");


--
-- Name: idx_tarefas_epic_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tarefas_epic_id" ON "public"."tarefas" USING "btree" ("epic_id");


--
-- Name: idx_tarefas_project_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tarefas_project_id" ON "public"."tarefas" USING "btree" ("project_id");


--
-- Name: idx_tarefas_sprint_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tarefas_sprint_id" ON "public"."tarefas" USING "btree" ("sprint_id");


--
-- Name: idx_tarefas_status_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tarefas_status_id" ON "public"."tarefas" USING "btree" ("status_id");


--
-- Name: idx_webhook_event_logs_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_webhook_event_logs_created" ON "public"."webhook_event_logs" USING "btree" ("created_at" DESC);


--
-- Name: idx_webhook_event_logs_event_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_webhook_event_logs_event_type" ON "public"."webhook_event_logs" USING "btree" ("event_type");


--
-- Name: idx_whiteboard_objects_whiteboard; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_whiteboard_objects_whiteboard" ON "public"."whiteboard_objects" USING "btree" ("whiteboard_id");


--
-- Name: idx_whiteboard_objects_zindex; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_whiteboard_objects_zindex" ON "public"."whiteboard_objects" USING "btree" ("whiteboard_id", "z_index");


--
-- Name: idx_whiteboards_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_whiteboards_parent" ON "public"."whiteboards" USING "btree" ("parent_branch_id");


--
-- Name: idx_whiteboards_project; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_whiteboards_project" ON "public"."whiteboards" USING "btree" ("project_id");


--
-- Name: idx_workflow_statuses_workflow_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_workflow_statuses_workflow_id" ON "public"."workflow_statuses" USING "btree" ("workflow_id");


--
-- Name: idx_workflows_board_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_workflows_board_id" ON "public"."workflows" USING "btree" ("board_id");


--
-- Name: whiteboards trg_whiteboards_bump_snapshot_version; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_whiteboards_bump_snapshot_version" BEFORE UPDATE ON "public"."whiteboards" FOR EACH ROW EXECUTE FUNCTION "public"."bump_whiteboard_snapshot_version"();


--
-- Name: branches trigger_auto_link_branches; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_auto_link_branches" AFTER INSERT ON "public"."branches" FOR EACH ROW EXECUTE FUNCTION "public"."auto_link_branch_tarefas"();


--
-- Name: commits trigger_auto_link_commits; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_auto_link_commits" AFTER INSERT ON "public"."commits" FOR EACH ROW EXECUTE FUNCTION "public"."auto_link_commit_tarefas"();


--
-- Name: pull_requests trigger_auto_link_prs; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_auto_link_prs" AFTER INSERT ON "public"."pull_requests" FOR EACH ROW EXECUTE FUNCTION "public"."auto_link_pr_tarefas"();


--
-- Name: boards update_boards_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_boards_updated_at" BEFORE UPDATE ON "public"."boards" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: branches update_branches_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_branches_updated_at" BEFORE UPDATE ON "public"."branches" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: pr_comments update_pr_comments_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_pr_comments_updated_at" BEFORE UPDATE ON "public"."pr_comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: pr_reviews update_pr_reviews_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_pr_reviews_updated_at" BEFORE UPDATE ON "public"."pr_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: pr_status_checks update_pr_status_checks_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_pr_status_checks_updated_at" BEFORE UPDATE ON "public"."pr_status_checks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: project_invites update_project_invites_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_project_invites_updated_at" BEFORE UPDATE ON "public"."project_invites" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: project_repos update_project_repos_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_project_repos_updated_at" BEFORE UPDATE ON "public"."project_repos" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: projects update_projects_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_projects_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: provider_connections update_provider_connections_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_provider_connections_updated_at" BEFORE UPDATE ON "public"."provider_connections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: pull_requests update_pull_requests_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_pull_requests_updated_at" BEFORE UPDATE ON "public"."pull_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: repos update_repos_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_repos_updated_at" BEFORE UPDATE ON "public"."repos" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: sprints update_sprints_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_sprints_updated_at" BEFORE UPDATE ON "public"."sprints" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: tarefa_comments update_tarefa_comments_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_tarefa_comments_updated_at" BEFORE UPDATE ON "public"."tarefa_comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: tarefas update_tarefas_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_tarefas_updated_at" BEFORE UPDATE ON "public"."tarefas" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: whiteboard_objects update_whiteboard_objects_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_whiteboard_objects_updated_at" BEFORE UPDATE ON "public"."whiteboard_objects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: whiteboards update_whiteboards_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_whiteboards_updated_at" BEFORE UPDATE ON "public"."whiteboards" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: workflows update_workflows_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_workflows_updated_at" BEFORE UPDATE ON "public"."workflows" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: audit_events audit_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_events"
    ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");


--
-- Name: boards boards_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."boards"
    ADD CONSTRAINT "boards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: boards boards_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."boards"
    ADD CONSTRAINT "boards_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;


--
-- Name: branches branches_repo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE CASCADE;


--
-- Name: commits commits_repo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."commits"
    ADD CONSTRAINT "commits_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE CASCADE;


--
-- Name: github_oauth_states github_oauth_states_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."github_oauth_states"
    ADD CONSTRAINT "github_oauth_states_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;


--
-- Name: github_oauth_states github_oauth_states_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."github_oauth_states"
    ADD CONSTRAINT "github_oauth_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: mentions mentions_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."mentions"
    ADD CONSTRAINT "mentions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."whiteboard_comments"("id") ON DELETE CASCADE;


--
-- Name: mentions mentions_mentioned_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."mentions"
    ADD CONSTRAINT "mentions_mentioned_user_id_profiles_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;


--
-- Name: pr_comments pr_comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pr_comments"
    ADD CONSTRAINT "pr_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id");


--
-- Name: pr_comments pr_comments_in_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pr_comments"
    ADD CONSTRAINT "pr_comments_in_reply_to_id_fkey" FOREIGN KEY ("in_reply_to_id") REFERENCES "public"."pr_comments"("id") ON DELETE CASCADE;


--
-- Name: pr_comments pr_comments_pr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pr_comments"
    ADD CONSTRAINT "pr_comments_pr_id_fkey" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE CASCADE;


--
-- Name: pr_reviews pr_reviews_pr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pr_reviews"
    ADD CONSTRAINT "pr_reviews_pr_id_fkey" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE CASCADE;


--
-- Name: pr_reviews pr_reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pr_reviews"
    ADD CONSTRAINT "pr_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."users"("id");


--
-- Name: pr_status_checks pr_status_checks_pr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pr_status_checks"
    ADD CONSTRAINT "pr_status_checks_pr_id_fkey" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: project_invites project_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."project_invites"
    ADD CONSTRAINT "project_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");


--
-- Name: project_invites project_invites_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."project_invites"
    ADD CONSTRAINT "project_invites_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;


--
-- Name: project_members project_members_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;


--
-- Name: project_members project_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: project_repos project_repos_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."project_repos"
    ADD CONSTRAINT "project_repos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;


--
-- Name: project_repos project_repos_repo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."project_repos"
    ADD CONSTRAINT "project_repos_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE CASCADE;


--
-- Name: project_sequences project_sequences_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."project_sequences"
    ADD CONSTRAINT "project_sequences_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;


--
-- Name: projects projects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: provider_connections provider_connections_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."provider_connections"
    ADD CONSTRAINT "provider_connections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: provider_connections provider_connections_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."provider_connections"
    ADD CONSTRAINT "provider_connections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;


--
-- Name: pull_requests pull_requests_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pull_requests"
    ADD CONSTRAINT "pull_requests_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id");


--
-- Name: pull_requests pull_requests_repo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pull_requests"
    ADD CONSTRAINT "pull_requests_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE CASCADE;


--
-- Name: repos repos_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."repos"
    ADD CONSTRAINT "repos_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE CASCADE;


--
-- Name: repos repos_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."repos"
    ADD CONSTRAINT "repos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;


--
-- Name: sprints sprints_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sprints"
    ADD CONSTRAINT "sprints_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE SET NULL;


--
-- Name: sprints sprints_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sprints"
    ADD CONSTRAINT "sprints_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: sprints sprints_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sprints"
    ADD CONSTRAINT "sprints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;


--
-- Name: tarefa_activity_log tarefa_activity_log_tarefa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_activity_log"
    ADD CONSTRAINT "tarefa_activity_log_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE CASCADE;


--
-- Name: tarefa_activity_log tarefa_activity_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_activity_log"
    ADD CONSTRAINT "tarefa_activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: tarefa_comments tarefa_comments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_comments"
    ADD CONSTRAINT "tarefa_comments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: tarefa_comments tarefa_comments_tarefa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_comments"
    ADD CONSTRAINT "tarefa_comments_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE CASCADE;


--
-- Name: tarefa_git_links tarefa_git_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_git_links"
    ADD CONSTRAINT "tarefa_git_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: tarefa_git_links tarefa_git_links_pr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_git_links"
    ADD CONSTRAINT "tarefa_git_links_pr_id_fkey" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE SET NULL;


--
-- Name: tarefa_git_links tarefa_git_links_tarefa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_git_links"
    ADD CONSTRAINT "tarefa_git_links_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE CASCADE;


--
-- Name: tarefa_links tarefa_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_links"
    ADD CONSTRAINT "tarefa_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: tarefa_links tarefa_links_source_tarefa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_links"
    ADD CONSTRAINT "tarefa_links_source_tarefa_id_fkey" FOREIGN KEY ("source_tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE CASCADE;


--
-- Name: tarefa_links tarefa_links_target_tarefa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_links"
    ADD CONSTRAINT "tarefa_links_target_tarefa_id_fkey" FOREIGN KEY ("target_tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE CASCADE;


--
-- Name: tarefa_watchers tarefa_watchers_tarefa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_watchers"
    ADD CONSTRAINT "tarefa_watchers_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE CASCADE;


--
-- Name: tarefa_watchers tarefa_watchers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_watchers"
    ADD CONSTRAINT "tarefa_watchers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: tarefa_whiteboard_origin tarefa_whiteboard_origin_tarefa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_whiteboard_origin"
    ADD CONSTRAINT "tarefa_whiteboard_origin_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE CASCADE;


--
-- Name: tarefa_whiteboard_origin tarefa_whiteboard_origin_whiteboard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefa_whiteboard_origin"
    ADD CONSTRAINT "tarefa_whiteboard_origin_whiteboard_id_fkey" FOREIGN KEY ("whiteboard_id") REFERENCES "public"."whiteboards"("id") ON DELETE CASCADE;


--
-- Name: tarefas tarefas_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "auth"."users"("id");


--
-- Name: tarefas tarefas_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE SET NULL;


--
-- Name: tarefas tarefas_epic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_epic_id_fkey" FOREIGN KEY ("epic_id") REFERENCES "public"."tarefas"("id") ON DELETE SET NULL;


--
-- Name: tarefas tarefas_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."tarefas"("id") ON DELETE CASCADE;


--
-- Name: tarefas tarefas_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;


--
-- Name: tarefas tarefas_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id");


--
-- Name: tarefas tarefas_sprint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE SET NULL;


--
-- Name: tarefas tarefas_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tarefas"
    ADD CONSTRAINT "tarefas_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "public"."workflow_statuses"("id");


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: whiteboard_collaborators whiteboard_collaborators_whiteboard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whiteboard_collaborators"
    ADD CONSTRAINT "whiteboard_collaborators_whiteboard_id_fkey" FOREIGN KEY ("whiteboard_id") REFERENCES "public"."whiteboards"("id") ON DELETE CASCADE;


--
-- Name: whiteboard_comments whiteboard_comments_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whiteboard_comments"
    ADD CONSTRAINT "whiteboard_comments_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "public"."whiteboard_objects"("id") ON DELETE CASCADE;


--
-- Name: whiteboard_comments whiteboard_comments_parent_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whiteboard_comments"
    ADD CONSTRAINT "whiteboard_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."whiteboard_comments"("id") ON DELETE CASCADE;


--
-- Name: whiteboard_comments whiteboard_comments_user_id_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whiteboard_comments"
    ADD CONSTRAINT "whiteboard_comments_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;


--
-- Name: whiteboard_comments whiteboard_comments_whiteboard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whiteboard_comments"
    ADD CONSTRAINT "whiteboard_comments_whiteboard_id_fkey" FOREIGN KEY ("whiteboard_id") REFERENCES "public"."whiteboards"("id") ON DELETE CASCADE;


--
-- Name: whiteboard_objects whiteboard_objects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whiteboard_objects"
    ADD CONSTRAINT "whiteboard_objects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: whiteboard_objects whiteboard_objects_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whiteboard_objects"
    ADD CONSTRAINT "whiteboard_objects_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."whiteboard_objects"("id") ON DELETE SET NULL;


--
-- Name: whiteboard_objects whiteboard_objects_whiteboard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whiteboard_objects"
    ADD CONSTRAINT "whiteboard_objects_whiteboard_id_fkey" FOREIGN KEY ("whiteboard_id") REFERENCES "public"."whiteboards"("id") ON DELETE CASCADE;


--
-- Name: whiteboards whiteboards_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whiteboards"
    ADD CONSTRAINT "whiteboards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: whiteboards whiteboards_parent_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whiteboards"
    ADD CONSTRAINT "whiteboards_parent_branch_id_fkey" FOREIGN KEY ("parent_branch_id") REFERENCES "public"."whiteboards"("id") ON DELETE SET NULL;


--
-- Name: whiteboards whiteboards_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."whiteboards"
    ADD CONSTRAINT "whiteboards_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;


--
-- Name: workflow_statuses workflow_statuses_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workflow_statuses"
    ADD CONSTRAINT "workflow_statuses_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;


--
-- Name: workflow_transitions workflow_transitions_from_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workflow_transitions"
    ADD CONSTRAINT "workflow_transitions_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "public"."workflow_statuses"("id") ON DELETE CASCADE;


--
-- Name: workflow_transitions workflow_transitions_to_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workflow_transitions"
    ADD CONSTRAINT "workflow_transitions_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "public"."workflow_statuses"("id") ON DELETE CASCADE;


--
-- Name: workflow_transitions workflow_transitions_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workflow_transitions"
    ADD CONSTRAINT "workflow_transitions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;


--
-- Name: workflows workflows_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE CASCADE;


--
-- Name: project_invites Admins and tech leads can create invites; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins and tech leads can create invites" ON "public"."project_invites" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "project_invites"."project_id") AND ("project_members"."user_id" = "auth"."uid"()) AND ("project_members"."role" = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"]))))));


--
-- Name: whiteboards Admins and tech leads can delete whiteboards; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins and tech leads can delete whiteboards" ON "public"."whiteboards" FOR DELETE USING (("public"."get_project_role"("auth"."uid"(), "project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"])));


--
-- Name: projects Admins and tech leads can update projects; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins and tech leads can update projects" ON "public"."projects" FOR UPDATE TO "authenticated" USING (("public"."get_project_role"("auth"."uid"(), "id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"])));


--
-- Name: boards Admins can delete boards; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete boards" ON "public"."boards" FOR DELETE USING (("public"."get_project_role"("auth"."uid"(), "project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"])));


--
-- Name: project_members Admins can delete project members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete project members" ON "public"."project_members" FOR DELETE TO "authenticated" USING (("public"."get_project_role"("auth"."uid"(), "project_id") = 'admin'::"public"."app_role"));


--
-- Name: sprints Admins can delete sprints; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete sprints" ON "public"."sprints" FOR DELETE USING (("public"."get_project_role"("auth"."uid"(), "project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"])));


--
-- Name: workflow_statuses Admins can delete statuses; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete statuses" ON "public"."workflow_statuses" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."boards" "b" ON (("b"."id" = "w"."board_id")))
  WHERE (("w"."id" = "workflow_statuses"."workflow_id") AND ("public"."get_project_role"("auth"."uid"(), "b"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"]))))));


--
-- Name: tarefas Admins can delete tarefas; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete tarefas" ON "public"."tarefas" FOR DELETE USING (("public"."get_project_role"("auth"."uid"(), "project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"])));


--
-- Name: workflow_transitions Admins can delete transitions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete transitions" ON "public"."workflow_transitions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."boards" "b" ON (("b"."id" = "w"."board_id")))
  WHERE (("w"."id" = "workflow_transitions"."workflow_id") AND ("public"."get_project_role"("auth"."uid"(), "b"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"]))))));


--
-- Name: workflows Admins can delete workflows; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete workflows" ON "public"."workflows" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."boards" "b"
  WHERE (("b"."id" = "workflows"."board_id") AND ("public"."get_project_role"("auth"."uid"(), "b"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"]))))));


--
-- Name: workflow_statuses Admins can insert statuses; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can insert statuses" ON "public"."workflow_statuses" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."boards" "b" ON (("b"."id" = "w"."board_id")))
  WHERE (("w"."id" = "workflow_statuses"."workflow_id") AND ("public"."get_project_role"("auth"."uid"(), "b"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"]))))));


--
-- Name: workflow_transitions Admins can insert transitions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can insert transitions" ON "public"."workflow_transitions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."boards" "b" ON (("b"."id" = "w"."board_id")))
  WHERE (("w"."id" = "workflow_transitions"."workflow_id") AND ("public"."get_project_role"("auth"."uid"(), "b"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"]))))));


--
-- Name: workflows Admins can insert workflows; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can insert workflows" ON "public"."workflows" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."boards" "b"
  WHERE (("b"."id" = "workflows"."board_id") AND ("public"."get_project_role"("auth"."uid"(), "b"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"]))))));


--
-- Name: provider_connections Admins can manage connections; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage connections" ON "public"."provider_connections" USING ((EXISTS ( SELECT 1
   FROM "public"."project_members" "pm"
  WHERE (("pm"."project_id" = "provider_connections"."project_id") AND ("pm"."user_id" = "auth"."uid"()) AND ("pm"."role" = 'admin'::"public"."app_role")))));


--
-- Name: project_members Admins can manage project members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage project members" ON "public"."project_members" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_project_role"("auth"."uid"(), "project_id") = 'admin'::"public"."app_role") OR (NOT (EXISTS ( SELECT 1
   FROM "public"."project_members" "project_members_1"
  WHERE ("project_members_1"."project_id" = "project_members_1"."project_id"))))));


--
-- Name: project_repos Admins can manage project repos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage project repos" ON "public"."project_repos" USING ((EXISTS ( SELECT 1
   FROM "public"."project_members" "pm"
  WHERE (("pm"."project_id" = "project_repos"."project_id") AND ("pm"."user_id" = "auth"."uid"()) AND ("pm"."role" = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"]))))));


--
-- Name: project_members Admins can update project members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update project members" ON "public"."project_members" FOR UPDATE TO "authenticated" USING (("public"."get_project_role"("auth"."uid"(), "project_id") = 'admin'::"public"."app_role"));


--
-- Name: workflow_statuses Admins can update statuses; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update statuses" ON "public"."workflow_statuses" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."boards" "b" ON (("b"."id" = "w"."board_id")))
  WHERE (("w"."id" = "workflow_statuses"."workflow_id") AND ("public"."get_project_role"("auth"."uid"(), "b"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"]))))));


--
-- Name: workflow_transitions Admins can update transitions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update transitions" ON "public"."workflow_transitions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."boards" "b" ON (("b"."id" = "w"."board_id")))
  WHERE (("w"."id" = "workflow_transitions"."workflow_id") AND ("public"."get_project_role"("auth"."uid"(), "b"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"]))))));


--
-- Name: workflows Admins can update workflows; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update workflows" ON "public"."workflows" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."boards" "b"
  WHERE (("b"."id" = "workflows"."board_id") AND ("public"."get_project_role"("auth"."uid"(), "b"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"]))))));


--
-- Name: audit_events Admins can view audit events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view audit events" ON "public"."audit_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."project_members" "pm"
  WHERE (("pm"."user_id" = "auth"."uid"()) AND ("pm"."role" = 'admin'::"public"."app_role")))));


--
-- Name: webhook_event_logs Admins can view webhook logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view webhook logs" ON "public"."webhook_event_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."project_members" "pm"
  WHERE (("pm"."user_id" = "auth"."uid"()) AND ("pm"."role" = 'admin'::"public"."app_role")))));


--
-- Name: project_invites Anyone can view invite by token; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone can view invite by token" ON "public"."project_invites" FOR SELECT USING (true);


--
-- Name: projects Authenticated users can create projects; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can create projects" ON "public"."projects" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));


--
-- Name: tarefa_comments Authors can delete comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authors can delete comments" ON "public"."tarefa_comments" FOR DELETE USING (("auth"."uid"() = "created_by"));


--
-- Name: tarefa_comments Authors can update comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authors can update comments" ON "public"."tarefa_comments" FOR UPDATE USING (("auth"."uid"() = "created_by"));


--
-- Name: mentions Comment author can create mentions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Comment author can create mentions" ON "public"."mentions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."whiteboard_comments" "c"
  WHERE (("c"."id" = "mentions"."comment_id") AND ("c"."user_id" = "auth"."uid"())))));


--
-- Name: pull_requests Developers can create PRs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Developers can create PRs" ON "public"."pull_requests" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."repos" "r"
     JOIN "public"."project_repos" "pr" ON (("pr"."repo_id" = "r"."id")))
     JOIN "public"."project_members" "pm" ON (("pm"."project_id" = "pr"."project_id")))
  WHERE (("r"."id" = "pull_requests"."repo_id") AND ("pm"."user_id" = "auth"."uid"()) AND ("pm"."role" = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"]))))));


--
-- Name: boards Editors can create boards; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can create boards" ON "public"."boards" FOR INSERT WITH CHECK (("public"."get_project_role"("auth"."uid"(), "project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"])));


--
-- Name: tarefa_comments Editors can create comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can create comments" ON "public"."tarefa_comments" FOR INSERT WITH CHECK ((("auth"."uid"() = "created_by") AND (EXISTS ( SELECT 1
   FROM "public"."tarefas" "t"
  WHERE (("t"."id" = "tarefa_comments"."tarefa_id") AND ("public"."get_project_role"("auth"."uid"(), "t"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"])))))));


--
-- Name: tarefa_git_links Editors can create git links; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can create git links" ON "public"."tarefa_git_links" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tarefas" "t"
  WHERE (("t"."id" = "tarefa_git_links"."tarefa_id") AND ("public"."get_project_role"("auth"."uid"(), "t"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"]))))));


--
-- Name: tarefa_links Editors can create links; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can create links" ON "public"."tarefa_links" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tarefas" "t"
  WHERE (("t"."id" = "tarefa_links"."source_tarefa_id") AND ("public"."get_project_role"("auth"."uid"(), "t"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"]))))));


--
-- Name: sprints Editors can create sprints; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can create sprints" ON "public"."sprints" FOR INSERT WITH CHECK (("public"."get_project_role"("auth"."uid"(), "project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"])));


--
-- Name: tarefas Editors can create tarefas; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can create tarefas" ON "public"."tarefas" FOR INSERT WITH CHECK (("public"."get_project_role"("auth"."uid"(), "project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"])));


--
-- Name: whiteboard_objects Editors can create whiteboard objects; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can create whiteboard objects" ON "public"."whiteboard_objects" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."whiteboards" "w"
  WHERE (("w"."id" = "whiteboard_objects"."whiteboard_id") AND ("public"."get_project_role"("auth"."uid"(), "w"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"]))))));


--
-- Name: tarefa_whiteboard_origin Editors can create whiteboard origin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can create whiteboard origin" ON "public"."tarefa_whiteboard_origin" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tarefas" "t"
  WHERE (("t"."id" = "tarefa_whiteboard_origin"."tarefa_id") AND ("public"."get_project_role"("auth"."uid"(), "t"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"]))))));


--
-- Name: tarefa_git_links Editors can delete git links; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can delete git links" ON "public"."tarefa_git_links" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."tarefas" "t"
  WHERE (("t"."id" = "tarefa_git_links"."tarefa_id") AND ("public"."get_project_role"("auth"."uid"(), "t"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"]))))));


--
-- Name: tarefa_links Editors can delete links; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can delete links" ON "public"."tarefa_links" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."tarefas" "t"
  WHERE (("t"."id" = "tarefa_links"."source_tarefa_id") AND ("public"."get_project_role"("auth"."uid"(), "t"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"]))))));


--
-- Name: whiteboard_objects Editors can delete whiteboard objects; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can delete whiteboard objects" ON "public"."whiteboard_objects" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."whiteboards" "w"
  WHERE (("w"."id" = "whiteboard_objects"."whiteboard_id") AND ("public"."get_project_role"("auth"."uid"(), "w"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"]))))));


--
-- Name: tarefa_whiteboard_origin Editors can delete whiteboard origin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can delete whiteboard origin" ON "public"."tarefa_whiteboard_origin" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."tarefas" "t"
  WHERE (("t"."id" = "tarefa_whiteboard_origin"."tarefa_id") AND ("public"."get_project_role"("auth"."uid"(), "t"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"]))))));


--
-- Name: boards Editors can update boards; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can update boards" ON "public"."boards" FOR UPDATE USING (("public"."get_project_role"("auth"."uid"(), "project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"])));


--
-- Name: tarefa_git_links Editors can update git links; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can update git links" ON "public"."tarefa_git_links" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."tarefas" "t"
  WHERE (("t"."id" = "tarefa_git_links"."tarefa_id") AND ("public"."get_project_role"("auth"."uid"(), "t"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"]))))));


--
-- Name: tarefa_links Editors can update links; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can update links" ON "public"."tarefa_links" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."tarefas" "t"
  WHERE (("t"."id" = "tarefa_links"."source_tarefa_id") AND ("public"."get_project_role"("auth"."uid"(), "t"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"]))))));


--
-- Name: sprints Editors can update sprints; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can update sprints" ON "public"."sprints" FOR UPDATE USING (("public"."get_project_role"("auth"."uid"(), "project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"])));


--
-- Name: tarefas Editors can update tarefas; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can update tarefas" ON "public"."tarefas" FOR UPDATE USING (("public"."get_project_role"("auth"."uid"(), "project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"])));


--
-- Name: whiteboard_objects Editors can update whiteboard objects; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can update whiteboard objects" ON "public"."whiteboard_objects" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."whiteboards" "w"
  WHERE (("w"."id" = "whiteboard_objects"."whiteboard_id") AND ("public"."get_project_role"("auth"."uid"(), "w"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"]))))));


--
-- Name: tarefa_whiteboard_origin Editors can update whiteboard origin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can update whiteboard origin" ON "public"."tarefa_whiteboard_origin" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."tarefas" "t"
  WHERE (("t"."id" = "tarefa_whiteboard_origin"."tarefa_id") AND ("public"."get_project_role"("auth"."uid"(), "t"."project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"]))))));


--
-- Name: whiteboards Editors can update whiteboards; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Editors can update whiteboards" ON "public"."whiteboards" FOR UPDATE USING (("public"."get_project_role"("auth"."uid"(), "project_id") = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role", 'developer'::"public"."app_role"])));


--
-- Name: project_invites Invite creators and admins can delete invites; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Invite creators and admins can delete invites" ON "public"."project_invites" FOR DELETE USING ((("invited_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "project_invites"."project_id") AND ("project_members"."user_id" = "auth"."uid"()) AND ("project_members"."role" = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"])))))));


--
-- Name: project_invites Invite creators and admins can update invites; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Invite creators and admins can update invites" ON "public"."project_invites" FOR UPDATE USING ((("invited_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "project_invites"."project_id") AND ("project_members"."user_id" = "auth"."uid"()) AND ("project_members"."role" = ANY (ARRAY['admin'::"public"."app_role", 'tech_lead'::"public"."app_role"])))))));


--
-- Name: pr_comments Members can create comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can create comments" ON "public"."pr_comments" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ((("public"."pull_requests" "pr"
     JOIN "public"."repos" "r" ON (("r"."id" = "pr"."repo_id")))
     JOIN "public"."project_repos" "prj" ON (("prj"."repo_id" = "r"."id")))
     JOIN "public"."project_members" "pm" ON (("pm"."project_id" = "prj"."project_id")))
  WHERE (("pr"."id" = "pr_comments"."pr_id") AND ("pm"."user_id" = "auth"."uid"()))))));


--
-- Name: whiteboards Members can create whiteboards; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can create whiteboards" ON "public"."whiteboards" FOR INSERT WITH CHECK (("public"."is_project_member"("auth"."uid"(), "project_id") AND ("auth"."uid"() = "created_by")));


--
-- Name: project_sequences Members can manage sequences; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can manage sequences" ON "public"."project_sequences" USING ("public"."is_project_member"("auth"."uid"(), "project_id"));


--
-- Name: pull_requests Members can view PRs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view PRs" ON "public"."pull_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."repos" "r"
     JOIN "public"."project_repos" "pr" ON (("pr"."repo_id" = "r"."id")))
     JOIN "public"."project_members" "pm" ON (("pm"."project_id" = "pr"."project_id")))
  WHERE (("r"."id" = "pull_requests"."repo_id") AND ("pm"."user_id" = "auth"."uid"())))));


--
-- Name: tarefa_activity_log Members can view activity; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view activity" ON "public"."tarefa_activity_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tarefas" "t"
  WHERE (("t"."id" = "tarefa_activity_log"."tarefa_id") AND "public"."is_project_member"("auth"."uid"(), "t"."project_id")))));


--
-- Name: boards Members can view boards; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view boards" ON "public"."boards" FOR SELECT USING ("public"."is_project_member"("auth"."uid"(), "project_id"));


--
-- Name: branches Members can view branches; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view branches" ON "public"."branches" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."repos" "r"
     JOIN "public"."project_repos" "pr" ON (("pr"."repo_id" = "r"."id")))
     JOIN "public"."project_members" "pm" ON (("pm"."project_id" = "pr"."project_id")))
  WHERE (("r"."id" = "branches"."repo_id") AND ("pm"."user_id" = "auth"."uid"())))));


--
-- Name: pr_comments Members can view comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view comments" ON "public"."pr_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((("public"."pull_requests" "pr"
     JOIN "public"."repos" "r" ON (("r"."id" = "pr"."repo_id")))
     JOIN "public"."project_repos" "prj" ON (("prj"."repo_id" = "r"."id")))
     JOIN "public"."project_members" "pm" ON (("pm"."project_id" = "prj"."project_id")))
  WHERE (("pr"."id" = "pr_comments"."pr_id") AND ("pm"."user_id" = "auth"."uid"())))));


--
-- Name: tarefa_comments Members can view comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view comments" ON "public"."tarefa_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tarefas" "t"
  WHERE (("t"."id" = "tarefa_comments"."tarefa_id") AND "public"."is_project_member"("auth"."uid"(), "t"."project_id")))));


--
-- Name: commits Members can view commits; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view commits" ON "public"."commits" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."repos" "r"
     JOIN "public"."project_repos" "pr" ON (("pr"."repo_id" = "r"."id")))
     JOIN "public"."project_members" "pm" ON (("pm"."project_id" = "pr"."project_id")))
  WHERE (("r"."id" = "commits"."repo_id") AND ("pm"."user_id" = "auth"."uid"())))));


--
-- Name: provider_connections Members can view connections; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view connections" ON "public"."provider_connections" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."project_members" "pm"
  WHERE (("pm"."project_id" = "provider_connections"."project_id") AND ("pm"."user_id" = "auth"."uid"())))));


--
-- Name: tarefa_git_links Members can view git links; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view git links" ON "public"."tarefa_git_links" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tarefas" "t"
  WHERE (("t"."id" = "tarefa_git_links"."tarefa_id") AND "public"."is_project_member"("auth"."uid"(), "t"."project_id")))));


--
-- Name: tarefa_links Members can view links; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view links" ON "public"."tarefa_links" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tarefas" "t"
  WHERE (("t"."id" = "tarefa_links"."source_tarefa_id") AND "public"."is_project_member"("auth"."uid"(), "t"."project_id")))));


--
-- Name: project_members Members can view project members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view project members" ON "public"."project_members" FOR SELECT TO "authenticated" USING ("public"."is_project_member"("auth"."uid"(), "project_id"));


--
-- Name: project_repos Members can view project repos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view project repos" ON "public"."project_repos" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."project_members" "pm"
  WHERE (("pm"."project_id" = "project_repos"."project_id") AND ("pm"."user_id" = "auth"."uid"())))));


--
-- Name: whiteboards Members can view project whiteboards; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view project whiteboards" ON "public"."whiteboards" FOR SELECT USING ("public"."is_project_member"("auth"."uid"(), "project_id"));


--
-- Name: repos Members can view repos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view repos" ON "public"."repos" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."project_members" "pm"
  WHERE (("pm"."project_id" = COALESCE("repos"."project_id", ( SELECT "pr"."project_id"
           FROM "public"."project_repos" "pr"
          WHERE ("pr"."repo_id" = "repos"."id")
         LIMIT 1))) AND ("pm"."user_id" = "auth"."uid"())))));


--
-- Name: pr_reviews Members can view reviews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view reviews" ON "public"."pr_reviews" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((("public"."pull_requests" "pr"
     JOIN "public"."repos" "r" ON (("r"."id" = "pr"."repo_id")))
     JOIN "public"."project_repos" "prj" ON (("prj"."repo_id" = "r"."id")))
     JOIN "public"."project_members" "pm" ON (("pm"."project_id" = "prj"."project_id")))
  WHERE (("pr"."id" = "pr_reviews"."pr_id") AND ("pm"."user_id" = "auth"."uid"())))));


--
-- Name: sprints Members can view sprints; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view sprints" ON "public"."sprints" FOR SELECT USING ("public"."is_project_member"("auth"."uid"(), "project_id"));


--
-- Name: pr_status_checks Members can view status checks; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view status checks" ON "public"."pr_status_checks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((("public"."pull_requests" "pr"
     JOIN "public"."repos" "r" ON (("r"."id" = "pr"."repo_id")))
     JOIN "public"."project_repos" "prj" ON (("prj"."repo_id" = "r"."id")))
     JOIN "public"."project_members" "pm" ON (("pm"."project_id" = "prj"."project_id")))
  WHERE (("pr"."id" = "pr_status_checks"."pr_id") AND ("pm"."user_id" = "auth"."uid"())))));


--
-- Name: workflow_statuses Members can view statuses; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view statuses" ON "public"."workflow_statuses" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."boards" "b" ON (("b"."id" = "w"."board_id")))
  WHERE (("w"."id" = "workflow_statuses"."workflow_id") AND "public"."is_project_member"("auth"."uid"(), "b"."project_id")))));


--
-- Name: tarefas Members can view tarefas; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view tarefas" ON "public"."tarefas" FOR SELECT USING ("public"."is_project_member"("auth"."uid"(), "project_id"));


--
-- Name: projects Members can view their projects; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view their projects" ON "public"."projects" FOR SELECT TO "authenticated" USING (("public"."is_project_member"("auth"."uid"(), "id") OR ("created_by" = "auth"."uid"())));


--
-- Name: workflow_transitions Members can view transitions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view transitions" ON "public"."workflow_transitions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."boards" "b" ON (("b"."id" = "w"."board_id")))
  WHERE (("w"."id" = "workflow_transitions"."workflow_id") AND "public"."is_project_member"("auth"."uid"(), "b"."project_id")))));


--
-- Name: tarefa_watchers Members can view watchers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view watchers" ON "public"."tarefa_watchers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tarefas" "t"
  WHERE (("t"."id" = "tarefa_watchers"."tarefa_id") AND "public"."is_project_member"("auth"."uid"(), "t"."project_id")))));


--
-- Name: whiteboard_objects Members can view whiteboard objects; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view whiteboard objects" ON "public"."whiteboard_objects" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."whiteboards" "w"
  WHERE (("w"."id" = "whiteboard_objects"."whiteboard_id") AND "public"."is_project_member"("auth"."uid"(), "w"."project_id")))));


--
-- Name: tarefa_whiteboard_origin Members can view whiteboard origin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view whiteboard origin" ON "public"."tarefa_whiteboard_origin" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tarefas" "t"
  WHERE (("t"."id" = "tarefa_whiteboard_origin"."tarefa_id") AND "public"."is_project_member"("auth"."uid"(), "t"."project_id")))));


--
-- Name: workflows Members can view workflows; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view workflows" ON "public"."workflows" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."boards" "b"
  WHERE (("b"."id" = "workflows"."board_id") AND "public"."is_project_member"("auth"."uid"(), "b"."project_id")))));


--
-- Name: projects Only admins can delete projects; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Only admins can delete projects" ON "public"."projects" FOR DELETE TO "authenticated" USING (("public"."get_project_role"("auth"."uid"(), "id") = 'admin'::"public"."app_role"));


--
-- Name: whiteboard_comments Project members can create comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Project members can create comments" ON "public"."whiteboard_comments" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."whiteboards" "w"
     JOIN "public"."project_members" "pm" ON (("pm"."project_id" = "w"."project_id")))
  WHERE (("w"."id" = "whiteboard_comments"."whiteboard_id") AND ("pm"."user_id" = "auth"."uid"()))))));


--
-- Name: whiteboard_collaborators Project members can view collaborators; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Project members can view collaborators" ON "public"."whiteboard_collaborators" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."whiteboards" "w"
     JOIN "public"."project_members" "pm" ON (("pm"."project_id" = "w"."project_id")))
  WHERE (("w"."id" = "whiteboard_collaborators"."whiteboard_id") AND ("pm"."user_id" = "auth"."uid"())))));


--
-- Name: whiteboard_comments Project members can view comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Project members can view comments" ON "public"."whiteboard_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."whiteboards" "w"
     JOIN "public"."project_members" "pm" ON (("pm"."project_id" = "w"."project_id")))
  WHERE (("w"."id" = "whiteboard_comments"."whiteboard_id") AND ("pm"."user_id" = "auth"."uid"())))));


--
-- Name: pr_reviews Reviewers can create reviews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Reviewers can create reviews" ON "public"."pr_reviews" FOR INSERT WITH CHECK ((("reviewer_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ((("public"."pull_requests" "pr"
     JOIN "public"."repos" "r" ON (("r"."id" = "pr"."repo_id")))
     JOIN "public"."project_repos" "prj" ON (("prj"."repo_id" = "r"."id")))
     JOIN "public"."project_members" "pm" ON (("pm"."project_id" = "prj"."project_id")))
  WHERE (("pr"."id" = "pr_reviews"."pr_id") AND ("pm"."user_id" = "auth"."uid"()) AND ("pr"."author_id" <> "auth"."uid"()))))));


--
-- Name: tarefa_activity_log System can create activity; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "System can create activity" ON "public"."tarefa_activity_log" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tarefas" "t"
  WHERE (("t"."id" = "tarefa_activity_log"."tarefa_id") AND "public"."is_project_member"("auth"."uid"(), "t"."project_id")))));


--
-- Name: tarefa_watchers Users can add themselves as watchers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can add themselves as watchers" ON "public"."tarefa_watchers" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: whiteboard_comments Users can delete their own comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own comments" ON "public"."whiteboard_comments" FOR DELETE USING (("user_id" = "auth"."uid"()));


--
-- Name: whiteboard_collaborators Users can delete their own presence; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own presence" ON "public"."whiteboard_collaborators" FOR DELETE USING (("user_id" = "auth"."uid"()));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: whiteboard_collaborators Users can insert their own presence; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own presence" ON "public"."whiteboard_collaborators" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: github_oauth_states Users can manage their own oauth states; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own oauth states" ON "public"."github_oauth_states" USING (("auth"."uid"() = "user_id"));


--
-- Name: mentions Users can mark their mentions as read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can mark their mentions as read" ON "public"."mentions" FOR UPDATE USING (("mentioned_user_id" = "auth"."uid"()));


--
-- Name: tarefa_watchers Users can remove themselves as watchers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can remove themselves as watchers" ON "public"."tarefa_watchers" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));


--
-- Name: whiteboard_comments Users can update their own comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own comments" ON "public"."whiteboard_comments" FOR UPDATE USING (("user_id" = "auth"."uid"()));


--
-- Name: whiteboard_collaborators Users can update their own presence; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own presence" ON "public"."whiteboard_collaborators" FOR UPDATE USING (("user_id" = "auth"."uid"()));


--
-- Name: profiles Users can view all profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);


--
-- Name: project_invites Users can view invites for their projects; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view invites for their projects" ON "public"."project_invites" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "project_invites"."project_id") AND ("project_members"."user_id" = "auth"."uid"())))));


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: mentions Users can view their own mentions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own mentions" ON "public"."mentions" FOR SELECT USING (("mentioned_user_id" = "auth"."uid"()));


--
-- Name: audit_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."audit_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: boards; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."boards" ENABLE ROW LEVEL SECURITY;

--
-- Name: branches; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."branches" ENABLE ROW LEVEL SECURITY;

--
-- Name: commits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."commits" ENABLE ROW LEVEL SECURITY;

--
-- Name: github_oauth_states; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."github_oauth_states" ENABLE ROW LEVEL SECURITY;

--
-- Name: mentions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."mentions" ENABLE ROW LEVEL SECURITY;

--
-- Name: pr_comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pr_comments" ENABLE ROW LEVEL SECURITY;

--
-- Name: pr_reviews; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pr_reviews" ENABLE ROW LEVEL SECURITY;

--
-- Name: pr_status_checks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pr_status_checks" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: project_invites; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."project_invites" ENABLE ROW LEVEL SECURITY;

--
-- Name: project_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."project_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: project_repos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."project_repos" ENABLE ROW LEVEL SECURITY;

--
-- Name: project_sequences; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."project_sequences" ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_connections; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."provider_connections" ENABLE ROW LEVEL SECURITY;

--
-- Name: pull_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pull_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: repos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."repos" ENABLE ROW LEVEL SECURITY;

--
-- Name: sprints; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."sprints" ENABLE ROW LEVEL SECURITY;

--
-- Name: tarefa_activity_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tarefa_activity_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: tarefa_comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tarefa_comments" ENABLE ROW LEVEL SECURITY;

--
-- Name: tarefa_git_links; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tarefa_git_links" ENABLE ROW LEVEL SECURITY;

--
-- Name: tarefa_links; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tarefa_links" ENABLE ROW LEVEL SECURITY;

--
-- Name: tarefa_watchers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tarefa_watchers" ENABLE ROW LEVEL SECURITY;

--
-- Name: tarefa_whiteboard_origin; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tarefa_whiteboard_origin" ENABLE ROW LEVEL SECURITY;

--
-- Name: tarefas; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tarefas" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_event_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."webhook_event_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: whiteboard_collaborators; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."whiteboard_collaborators" ENABLE ROW LEVEL SECURITY;

--
-- Name: whiteboard_comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."whiteboard_comments" ENABLE ROW LEVEL SECURITY;

--
-- Name: whiteboard_objects; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."whiteboard_objects" ENABLE ROW LEVEL SECURITY;

--
-- Name: whiteboards; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."whiteboards" ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_statuses; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."workflow_statuses" ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_transitions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."workflow_transitions" ENABLE ROW LEVEL SECURITY;

--
-- Name: workflows; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."workflows" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "auto_link_branch_tarefas"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."auto_link_branch_tarefas"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_link_branch_tarefas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_link_branch_tarefas"() TO "service_role";


--
-- Name: FUNCTION "auto_link_commit_tarefas"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."auto_link_commit_tarefas"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_link_commit_tarefas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_link_commit_tarefas"() TO "service_role";


--
-- Name: FUNCTION "auto_link_pr_tarefas"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."auto_link_pr_tarefas"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_link_pr_tarefas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_link_pr_tarefas"() TO "service_role";


--
-- Name: FUNCTION "bump_whiteboard_snapshot_version"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."bump_whiteboard_snapshot_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."bump_whiteboard_snapshot_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_whiteboard_snapshot_version"() TO "service_role";


--
-- Name: FUNCTION "can_merge_pr"("p_user_id" "uuid", "p_pr_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."can_merge_pr"("p_user_id" "uuid", "p_pr_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_merge_pr"("p_user_id" "uuid", "p_pr_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_merge_pr"("p_user_id" "uuid", "p_pr_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "cleanup_expired_oauth_states"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."cleanup_expired_oauth_states"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_oauth_states"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_oauth_states"() TO "service_role";


--
-- Name: FUNCTION "create_default_workflow"("p_board_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."create_default_workflow"("p_board_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_default_workflow"("p_board_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_default_workflow"("p_board_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "create_whiteboard_branch"("source_whiteboard_id" "uuid", "branch_name" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."create_whiteboard_branch"("source_whiteboard_id" "uuid", "branch_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_whiteboard_branch"("source_whiteboard_id" "uuid", "branch_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_whiteboard_branch"("source_whiteboard_id" "uuid", "branch_name" "text") TO "service_role";


--
-- Name: FUNCTION "detect_and_link_tarefas"("p_text" "text", "p_repo_id" "uuid", "p_project_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_branch_name" "text", "p_commit_sha" "text", "p_pr_number" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."detect_and_link_tarefas"("p_text" "text", "p_repo_id" "uuid", "p_project_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_branch_name" "text", "p_commit_sha" "text", "p_pr_number" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."detect_and_link_tarefas"("p_text" "text", "p_repo_id" "uuid", "p_project_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_branch_name" "text", "p_commit_sha" "text", "p_pr_number" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_and_link_tarefas"("p_text" "text", "p_repo_id" "uuid", "p_project_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_branch_name" "text", "p_commit_sha" "text", "p_pr_number" integer) TO "service_role";


--
-- Name: FUNCTION "generate_tarefa_key"("p_project_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."generate_tarefa_key"("p_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_tarefa_key"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_tarefa_key"("p_project_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_pr_review_status"("p_pr_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_pr_review_status"("p_pr_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_pr_review_status"("p_pr_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pr_review_status"("p_pr_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_project_role"("_user_id" "uuid", "_project_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_project_role"("_user_id" "uuid", "_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_project_role"("_user_id" "uuid", "_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_project_role"("_user_id" "uuid", "_project_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_repo_project"("p_repo_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_repo_project"("p_repo_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_repo_project"("p_repo_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_repo_project"("p_repo_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "handle_new_user"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


--
-- Name: FUNCTION "has_role"("_user_id" "uuid", "_role" "public"."app_role"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";


--
-- Name: FUNCTION "is_project_member"("_user_id" "uuid", "_project_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_project_member"("_user_id" "uuid", "_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_project_member"("_user_id" "uuid", "_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_project_member"("_user_id" "uuid", "_project_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "merge_whiteboard_branch"("branch_whiteboard_id" "uuid", "target_whiteboard_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."merge_whiteboard_branch"("branch_whiteboard_id" "uuid", "target_whiteboard_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_whiteboard_branch"("branch_whiteboard_id" "uuid", "target_whiteboard_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_whiteboard_branch"("branch_whiteboard_id" "uuid", "target_whiteboard_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "update_updated_at_column"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


--
-- Name: TABLE "audit_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."audit_events" TO "anon";
GRANT ALL ON TABLE "public"."audit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_events" TO "service_role";


--
-- Name: TABLE "boards"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."boards" TO "anon";
GRANT ALL ON TABLE "public"."boards" TO "authenticated";
GRANT ALL ON TABLE "public"."boards" TO "service_role";


--
-- Name: TABLE "branches"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."branches" TO "anon";
GRANT ALL ON TABLE "public"."branches" TO "authenticated";
GRANT ALL ON TABLE "public"."branches" TO "service_role";


--
-- Name: TABLE "commits"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."commits" TO "anon";
GRANT ALL ON TABLE "public"."commits" TO "authenticated";
GRANT ALL ON TABLE "public"."commits" TO "service_role";


--
-- Name: TABLE "github_oauth_states"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."github_oauth_states" TO "anon";
GRANT ALL ON TABLE "public"."github_oauth_states" TO "authenticated";
GRANT ALL ON TABLE "public"."github_oauth_states" TO "service_role";


--
-- Name: TABLE "mentions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."mentions" TO "anon";
GRANT ALL ON TABLE "public"."mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."mentions" TO "service_role";


--
-- Name: TABLE "pr_comments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pr_comments" TO "anon";
GRANT ALL ON TABLE "public"."pr_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."pr_comments" TO "service_role";


--
-- Name: TABLE "pr_reviews"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pr_reviews" TO "anon";
GRANT ALL ON TABLE "public"."pr_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."pr_reviews" TO "service_role";


--
-- Name: TABLE "pr_status_checks"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pr_status_checks" TO "anon";
GRANT ALL ON TABLE "public"."pr_status_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."pr_status_checks" TO "service_role";


--
-- Name: TABLE "profiles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";


--
-- Name: TABLE "project_invites"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."project_invites" TO "anon";
GRANT ALL ON TABLE "public"."project_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."project_invites" TO "service_role";


--
-- Name: TABLE "project_members"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."project_members" TO "anon";
GRANT ALL ON TABLE "public"."project_members" TO "authenticated";
GRANT ALL ON TABLE "public"."project_members" TO "service_role";


--
-- Name: TABLE "project_repos"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."project_repos" TO "anon";
GRANT ALL ON TABLE "public"."project_repos" TO "authenticated";
GRANT ALL ON TABLE "public"."project_repos" TO "service_role";


--
-- Name: TABLE "project_sequences"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."project_sequences" TO "anon";
GRANT ALL ON TABLE "public"."project_sequences" TO "authenticated";
GRANT ALL ON TABLE "public"."project_sequences" TO "service_role";


--
-- Name: TABLE "projects"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";


--
-- Name: TABLE "provider_connections"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."provider_connections" TO "anon";
GRANT ALL ON TABLE "public"."provider_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_connections" TO "service_role";


--
-- Name: TABLE "pull_requests"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pull_requests" TO "anon";
GRANT ALL ON TABLE "public"."pull_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."pull_requests" TO "service_role";


--
-- Name: TABLE "repos"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."repos" TO "anon";
GRANT ALL ON TABLE "public"."repos" TO "authenticated";
GRANT ALL ON TABLE "public"."repos" TO "service_role";


--
-- Name: TABLE "sprints"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."sprints" TO "anon";
GRANT ALL ON TABLE "public"."sprints" TO "authenticated";
GRANT ALL ON TABLE "public"."sprints" TO "service_role";


--
-- Name: TABLE "tarefa_activity_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tarefa_activity_log" TO "anon";
GRANT ALL ON TABLE "public"."tarefa_activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefa_activity_log" TO "service_role";


--
-- Name: TABLE "tarefa_comments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tarefa_comments" TO "anon";
GRANT ALL ON TABLE "public"."tarefa_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefa_comments" TO "service_role";


--
-- Name: TABLE "tarefa_git_links"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tarefa_git_links" TO "anon";
GRANT ALL ON TABLE "public"."tarefa_git_links" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefa_git_links" TO "service_role";


--
-- Name: TABLE "tarefa_links"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tarefa_links" TO "anon";
GRANT ALL ON TABLE "public"."tarefa_links" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefa_links" TO "service_role";


--
-- Name: TABLE "tarefa_watchers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tarefa_watchers" TO "anon";
GRANT ALL ON TABLE "public"."tarefa_watchers" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefa_watchers" TO "service_role";


--
-- Name: TABLE "tarefa_whiteboard_origin"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tarefa_whiteboard_origin" TO "anon";
GRANT ALL ON TABLE "public"."tarefa_whiteboard_origin" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefa_whiteboard_origin" TO "service_role";


--
-- Name: TABLE "tarefas"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tarefas" TO "anon";
GRANT ALL ON TABLE "public"."tarefas" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefas" TO "service_role";


--
-- Name: TABLE "user_roles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";


--
-- Name: TABLE "webhook_event_logs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."webhook_event_logs" TO "anon";
GRANT ALL ON TABLE "public"."webhook_event_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_event_logs" TO "service_role";


--
-- Name: TABLE "whiteboard_collaborators"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."whiteboard_collaborators" TO "anon";
GRANT ALL ON TABLE "public"."whiteboard_collaborators" TO "authenticated";
GRANT ALL ON TABLE "public"."whiteboard_collaborators" TO "service_role";


--
-- Name: TABLE "whiteboard_comments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."whiteboard_comments" TO "anon";
GRANT ALL ON TABLE "public"."whiteboard_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."whiteboard_comments" TO "service_role";


--
-- Name: TABLE "whiteboard_objects"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."whiteboard_objects" TO "anon";
GRANT ALL ON TABLE "public"."whiteboard_objects" TO "authenticated";
GRANT ALL ON TABLE "public"."whiteboard_objects" TO "service_role";


--
-- Name: TABLE "whiteboards"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."whiteboards" TO "anon";
GRANT ALL ON TABLE "public"."whiteboards" TO "authenticated";
GRANT ALL ON TABLE "public"."whiteboards" TO "service_role";


--
-- Name: TABLE "workflow_statuses"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."workflow_statuses" TO "anon";
GRANT ALL ON TABLE "public"."workflow_statuses" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_statuses" TO "service_role";


--
-- Name: TABLE "workflow_transitions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."workflow_transitions" TO "anon";
GRANT ALL ON TABLE "public"."workflow_transitions" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_transitions" TO "service_role";


--
-- Name: TABLE "workflows"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."workflows" TO "anon";
GRANT ALL ON TABLE "public"."workflows" TO "authenticated";
GRANT ALL ON TABLE "public"."workflows" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

-- \unrestrict 8HQlrd3btN5hTjhJqJa6aCHc8nQBn8mzEPh5tcAmU5Kb61yrk9ZGfXvR3PqMncW

