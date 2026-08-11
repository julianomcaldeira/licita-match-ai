
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'contratos-dia-tick';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('contratos-dia-tick', '* * * * *', $$SELECT public.contratos_dia_tick(2);$$);

-- dias que ficaram presos em 'processing' voltam imediatamente para a fila
UPDATE public.contratos_dia_queue
   SET status = 'pending', claimed_at = NULL, attempts = 0, updated_at = now()
 WHERE status = 'processing';
