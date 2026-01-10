-- Update branch RPCs to use whiteboards.canvas_snapshot instead of whiteboard_objects snapshot-copying
-- Requires: 20251217000002_whiteboards_canvas_snapshot.sql

CREATE OR REPLACE FUNCTION public.create_whiteboard_branch(
  source_whiteboard_id uuid,
  branch_name text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.merge_whiteboard_branch(
  branch_whiteboard_id uuid,
  target_whiteboard_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
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


