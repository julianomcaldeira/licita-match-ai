
-- Update cron jobs for optimized pipeline

-- 1. Update daily cron to use new 7-day window (already handles all mods)
SELECT cron.unschedule('pncp-ingestao-diaria');
SELECT cron.schedule(
  'pncp-ingestao-diaria',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url:='https://eiksdfobghixofsxskke.supabase.co/functions/v1/ingest-pncp',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3NkZm9iZ2hpeG9mc3hza2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzY0MzcsImV4cCI6MjA4NzU1MjQzN30.30O_CNCvL_WpoL0a40oKILdQyt9cY1ZXPZYw_ogeecc"}'::jsonb,
    body:='{"mode": "cron"}'::jsonb,
    timeout_milliseconds:=120000
  ) as request_id;
  $$
);

-- 2. Update winner processing to every 2 minutes with larger batch
SELECT cron.unschedule('backlog-vencedores-5min');
SELECT cron.schedule(
  'backlog-vencedores-2min',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url:='https://eiksdfobghixofsxskke.supabase.co/functions/v1/ingest-pncp',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3NkZm9iZ2hpeG9mc3hza2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzY0MzcsImV4cCI6MjA4NzU1MjQzN30.30O_CNCvL_WpoL0a40oKILdQyt9cY1ZXPZYw_ogeecc"}'::jsonb,
    body:='{"mode": "winners", "limit": 500}'::jsonb,
    timeout_milliseconds:=120000
  ) as request_id;
  $$
);

-- 3. Add gap-fill job every 30 minutes to detect and fill missed data
SELECT cron.schedule(
  'pncp-gap-fill',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url:='https://eiksdfobghixofsxskke.supabase.co/functions/v1/ingest-pncp',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3NkZm9iZ2hpeG9mc3hza2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzY0MzcsImV4cCI6MjA4NzU1MjQzN30.30O_CNCvL_WpoL0a40oKILdQyt9cY1ZXPZYw_ogeecc"}'::jsonb,
    body:='{"mode": "gap-fill"}'::jsonb,
    timeout_milliseconds:=120000
  ) as request_id;
  $$
);

-- 4. Keep backfill running every 2 min (offset by 1 min from winners)
SELECT cron.unschedule('backfill-pncp-gaps-v2');
SELECT cron.schedule(
  'backfill-pncp-gaps-v3',
  '1-59/2 * * * *',
  $$
  SELECT net.http_post(
    url:='https://eiksdfobghixofsxskke.supabase.co/functions/v1/ingest-pncp',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3NkZm9iZ2hpeG9mc3hza2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzY0MzcsImV4cCI6MjA4NzU1MjQzN30.30O_CNCvL_WpoL0a40oKILdQyt9cY1ZXPZYw_ogeecc"}'::jsonb,
    body:='{"mode": "bulk-backfill", "dataInicial": "20230101"}'::jsonb,
    timeout_milliseconds:=120000
  ) as request_id;
  $$
);
