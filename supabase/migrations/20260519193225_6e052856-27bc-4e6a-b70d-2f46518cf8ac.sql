-- 1) Cancela jobs de ingestão presos
UPDATE public.ingestion_jobs
SET status = 'cancelled',
    finished_at = now(),
    error_message = COALESCE(error_message,'') || ' | cancelado manualmente para aplicar fix do mode=bulk-contratos'
WHERE status IN ('pending','running');

-- 2) Recria cron de winners-backlog SEM pg_sleep (3 jobs paralelos)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobid, jobname FROM cron.job
           WHERE jobname IN ('backlog-vencedores-turbo','backlog-vencedores-turbo-a','backlog-vencedores-turbo-b','backlog-vencedores-turbo-c')
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'backlog-vencedores-turbo-a',
  '* * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://eiksdfobghixofsxskke.supabase.co/functions/v1/ingest-pncp',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3NkZm9iZ2hpeG9mc3hza2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzY0MzcsImV4cCI6MjA4NzU1MjQzN30.30O_CNCvL_WpoL0a40oKILdQyt9cY1ZXPZYw_ogeecc'),
    body := jsonb_build_object('mode','winners','limit',800)
  );
  $cmd$
);

SELECT cron.schedule(
  'backlog-vencedores-turbo-b',
  '* * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://eiksdfobghixofsxskke.supabase.co/functions/v1/ingest-pncp',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3NkZm9iZ2hpeG9mc3hza2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzY0MzcsImV4cCI6MjA4NzU1MjQzN30.30O_CNCvL_WpoL0a40oKILdQyt9cY1ZXPZYw_ogeecc'),
    body := jsonb_build_object('mode','winners','limit',800)
  );
  $cmd$
);

SELECT cron.schedule(
  'backlog-vencedores-turbo-c',
  '* * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://eiksdfobghixofsxskke.supabase.co/functions/v1/ingest-pncp',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3NkZm9iZ2hpeG9mc3hza2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzY0MzcsImV4cCI6MjA4NzU1MjQzN30.30O_CNCvL_WpoL0a40oKILdQyt9cY1ZXPZYw_ogeecc'),
    body := jsonb_build_object('mode','winners','limit',800)
  );
  $cmd$
);