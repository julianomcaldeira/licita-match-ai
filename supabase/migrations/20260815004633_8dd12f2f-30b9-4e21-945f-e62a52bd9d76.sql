-- 1) Dispatcher que só chama o pncp-fill-gaps quando o circuito 'compras' está fechado
CREATE OR REPLACE FUNCTION public.pncp_gaps_dispatch()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    body := '{"target":"pncp-fill-gaps","payload":{"mode":"gaps","autoscale":true}}'::jsonb
  );
  RETURN 'dispatched';
END;
$$;

REVOKE ALL ON FUNCTION public.pncp_gaps_dispatch() FROM PUBLIC, anon, authenticated;

-- 2) Reagenda os crons de gaps para usar o dispatcher com guarda de circuito
SELECT cron.alter_job(75, command := 'SELECT public.pncp_gaps_dispatch();');
SELECT cron.alter_job(77, command := 'SELECT pg_sleep(20); SELECT public.pncp_gaps_dispatch();');
SELECT cron.alter_job(78, command := 'SELECT pg_sleep(40); SELECT public.pncp_gaps_dispatch();');

-- 3) Destrava a fila agora
SELECT * FROM public.requeue_stalled_gaps(8, 200000);

-- 4) Reduz agressividade da fila de gaps para evitar 429
UPDATE public.cron_autoscale_state
   SET limit_per_run = 500,
       parallelism = 6,
       min_parallel = 3,
       max_parallel = 12,
       min_limit = 250,
       max_limit = 1500,
       updated_at = now()
 WHERE target = 'gaps';