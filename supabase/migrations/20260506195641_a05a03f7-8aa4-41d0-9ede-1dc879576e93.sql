
-- Function: agendamento automático com controle de concorrência e retry
CREATE OR REPLACE FUNCTION public.schedule_auto_ingestion(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing_id uuid;
  v_last_status text;
  v_last_finished timestamptz;
  v_last_started timestamptz;
  v_new_id uuid;
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3NkZm9iZ2hpeG9mc3hza2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzY0MzcsImV4cCI6MjA4NzU1MjQzN30.30O_CNCvL_WpoL0a40oKILdQyt9cY1ZXPZYw_ogeecc';
BEGIN
  -- Concurrency: skip if any pending/running job
  SELECT id INTO v_existing_id
  FROM ingestion_jobs
  WHERE status IN ('pending', 'running')
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('skipped', 'already_running', 'jobId', v_existing_id);
  END IF;

  -- Look at last job
  SELECT status, finished_at, started_at
    INTO v_last_status, v_last_finished, v_last_started
  FROM ingestion_jobs
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT p_force THEN
    -- Skip if last job completed less than 2h ago (avoid double daily run)
    IF v_last_status = 'completed'
       AND v_last_finished IS NOT NULL
       AND v_last_finished > now() - interval '2 hours' THEN
      RETURN jsonb_build_object('skipped', 'recent_completion', 'last_finished_at', v_last_finished);
    END IF;

    -- For hourly retry mode: only retry if last failed and >1h passed
    -- (force=true bypasses; daily run also bypasses by passing force=true)
    IF v_last_status NOT IN ('failed', 'cancelled')
       AND v_last_finished IS NOT NULL
       AND v_last_finished > now() - interval '1 hour' THEN
      RETURN jsonb_build_object('skipped', 'too_soon', 'last_status', v_last_status);
    END IF;
  END IF;

  -- Create new job
  INSERT INTO ingestion_jobs (status, current_phase, phases_total, phase_label)
  VALUES ('pending', 'pncp', 5, 'Agendado automaticamente')
  RETURNING id INTO v_new_id;

  -- Kick the orchestrator
  PERFORM net.http_post(
    url := 'https://eiksdfobghixofsxskke.supabase.co/functions/v1/pipeline-orchestrator',
    headers := jsonb_build_object('Content-Type','application/json','apikey', v_anon),
    body := jsonb_build_object('jobId', v_new_id, 'internal', true, 'source', 'auto-schedule')
  );

  RETURN jsonb_build_object('started', true, 'jobId', v_new_id, 'mode', CASE WHEN p_force THEN 'forced' ELSE 'retry' END);
END;
$$;

-- Remove older versions if any
DO $$ BEGIN
  PERFORM cron.unschedule('auto-ingestion-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('auto-ingestion-hourly-retry');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Daily run at 02:30 UTC (force=true: always start if nothing is running)
SELECT cron.schedule(
  'auto-ingestion-daily',
  '30 2 * * *',
  $cron$ SELECT public.schedule_auto_ingestion(true); $cron$
);

-- Hourly retry: only acts if last job failed/cancelled >1h ago and nothing is running
SELECT cron.schedule(
  'auto-ingestion-hourly-retry',
  '15 * * * *',
  $cron$ SELECT public.schedule_auto_ingestion(false); $cron$
);
