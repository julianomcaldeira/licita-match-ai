
-- Retention automation to prevent regrowth of pncp_raw and ingestao_logs

-- Unschedule if they already exist (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retention-pncp-raw-daily') THEN
    PERFORM cron.unschedule('retention-pncp-raw-daily');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retention-ingestao-logs-daily') THEN
    PERFORM cron.unschedule('retention-ingestao-logs-daily');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retention-auditoria-ingestao-weekly') THEN
    PERFORM cron.unschedule('retention-auditoria-ingestao-weekly');
  END IF;
END$$;

-- Daily 05:15 UTC: delete pncp_raw processed rows older than 7 days,
-- and any pncp_raw row older than 30 days regardless of flag (safety cap).
SELECT cron.schedule(
  'retention-pncp-raw-daily',
  '15 5 * * *',
  $cron$
    DELETE FROM public.pncp_raw
    WHERE (processado = true AND coletado_em < now() - interval '7 days')
       OR (coletado_em < now() - interval '30 days');
  $cron$
);

-- Daily 05:30 UTC: keep only last 60 days of ingestao_logs
SELECT cron.schedule(
  'retention-ingestao-logs-daily',
  '30 5 * * *',
  $cron$
    DELETE FROM public.ingestao_logs
    WHERE COALESCE(data_fim, data_inicio, created_at) < now() - interval '60 days';
  $cron$
);

-- Weekly Sunday 05:45 UTC: keep only last 90 days of auditoria_ingestao
SELECT cron.schedule(
  'retention-auditoria-ingestao-weekly',
  '45 5 * * 0',
  $cron$
    DELETE FROM public.auditoria_ingestao
    WHERE created_at < now() - interval '90 days';
  $cron$
);
