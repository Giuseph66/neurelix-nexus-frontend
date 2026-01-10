-- Add per-whiteboard Fabric snapshot storage for deterministic realtime sync
-- This migration introduces a single JSON snapshot as the source of truth for the canvas

-- 1) Columns for snapshot + optimistic versioning
ALTER TABLE public.whiteboards
  ADD COLUMN IF NOT EXISTS canvas_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_version bigint NOT NULL DEFAULT 0;

-- 2) Version bump on snapshot change (prevents client-side loops / allows ordering)
CREATE OR REPLACE FUNCTION public.bump_whiteboard_snapshot_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only bump when the snapshot actually changes (NULL-safe)
  IF (NEW.canvas_snapshot IS DISTINCT FROM OLD.canvas_snapshot) THEN
    NEW.snapshot_version := COALESCE(OLD.snapshot_version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_whiteboards_bump_snapshot_version'
  ) THEN
    CREATE TRIGGER trg_whiteboards_bump_snapshot_version
    BEFORE UPDATE ON public.whiteboards
    FOR EACH ROW
    EXECUTE FUNCTION public.bump_whiteboard_snapshot_version();
  END IF;
END $$;


