
CREATE OR REPLACE FUNCTION public.pncp_gaps_dispatch()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  st text;
  until timestamptz;
BEGIN
  SELECT state, open_until INTO st, until FROM public.pncp_circuit WHERE source = 'compras';

  IF st = 'open' AND until IS NOT NULL AND until > now() THEN
    RETURN 'skipped: circuit open until ' || until::text;
  END IF;

  PERFORM net.http_post(
    url := 'https://eiksdfobghixofsxskke.supabase.co/functions/v1/internal-cron-dispatcher',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3NkZm9iZ2hpeG9mc3hza2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzY0MzcsImV4cCI6MjA4NzU1MjQzN30.30O_CNCvL_WpoL0a40oKILdQyt9cY1ZXPZYw_ogeecc"}'::jsonb,
    body := '{"target":"pncp-fill-gaps","payload":{"mode":"drain","limit":300,"parallel":4,"paceMs":150,"paceMinMs":90,"paceMaxMs":5000}}'::jsonb,
    timeout_milliseconds := 240000
  );
  RETURN 'dispatched';
END;
$function$;

UPDATE public.pncp_gap_queue
   SET status = 'pending', claimed_at = NULL, updated_at = now()
 WHERE status = 'processing'
   AND claimed_at < now() - interval '10 minutes';
