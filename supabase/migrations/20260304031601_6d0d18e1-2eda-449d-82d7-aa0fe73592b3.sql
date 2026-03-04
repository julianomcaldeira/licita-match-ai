
-- Schedule backfill to run every 2 minutes until all gaps are filled
SELECT cron.schedule(
  'backfill-pncp-gaps',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://eiksdfobghixofsxskke.supabase.co/functions/v1/ingest-pncp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"mode":"bulk-backfill","dataInicial":"20231201","dataFinal":"20260303"}'::jsonb
  );
  $$
);
