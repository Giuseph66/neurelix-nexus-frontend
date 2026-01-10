-- Enable Realtime for whiteboard-related tables
-- Based on Supabase Realtime documentation.
--
-- The supabase_realtime publication is created automatically by Supabase.
-- We just need to add our tables to it.
--
-- IMPORTANT: Tables must have REPLICA IDENTITY set to DEFAULT or FULL for Realtime to work.

DO $$
BEGIN
  -- Add whiteboard_objects
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'whiteboard_objects'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whiteboard_objects;
  END IF;

  -- Add whiteboard_comments
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'whiteboard_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whiteboard_comments;
  END IF;

  -- Add mentions
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mentions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mentions;
  END IF;
END $$;

ALTER TABLE public.whiteboard_objects REPLICA IDENTITY DEFAULT;
ALTER TABLE public.whiteboard_comments REPLICA IDENTITY DEFAULT;
ALTER TABLE public.mentions REPLICA IDENTITY DEFAULT;


