-- Enable Realtime for whiteboards snapshot updates
-- Adds whiteboards to publication and sets REPLICA IDENTITY.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'whiteboards'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whiteboards;
  END IF;
END $$;

ALTER TABLE public.whiteboards REPLICA IDENTITY DEFAULT;


