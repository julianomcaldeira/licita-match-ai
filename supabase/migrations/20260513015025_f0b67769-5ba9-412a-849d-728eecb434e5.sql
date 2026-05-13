
-- Watchdog columns to detect stalls across checks
ALTER TABLE public.ingestion_jobs
  ADD COLUMN IF NOT EXISTS watchdog_last_progress integer,
  ADD COLUMN IF NOT EXISTS watchdog_last_phase text,
  ADD COLUMN IF NOT EXISTS watchdog_last_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS watchdog_restart_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS watchdog_parent_job uuid;

-- Watchdog function
CREATE OR REPLACE FUNCTION public.ingestion_watchdog()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_idle interval;
  v_stale_tick boolean;
  v_no_progress boolean;
  v_should_kill boolean;
  v_reason text;
  v_killed jsonb := '[]'::jsonb;
  v_new_id uuid;
  v_restarts int;
  v_parent uuid;
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3NkZm9iZ2hpeG9mc3hza2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzY0MzcsImV4cCI6MjA4NzU1MjQzN30.30O_CNCvL_WpoL0a40oKILdQyt9cY1ZXPZYw_ogeecc';
  -- thresholds
  v_max_idle interval := interval '15 minutes';     -- no tick for 15 min
  v_no_prog_window interval := interval '20 minutes'; -- same progress for 20 min
  v_max_restarts int := 3;                            -- safety cap per chain
BEGIN
  FOR r IN
    SELECT id, status, current_phase, phase_progress_current,
           last_tick_at, started_at, created_at,
           watchdog_last_progress, watchdog_last_phase, watchdog_last_check_at,
           watchdog_restart_count, watchdog_parent_job
    FROM ingestion_jobs
    WHERE status IN ('pending','running')
  LOOP
    v_idle := now() - COALESCE(r.last_tick_at, r.started_at, r.created_at);
    v_stale_tick := v_idle > v_max_idle;

    -- detect no-progress: same phase + same progress since last watchdog check older than window
    v_no_progress := (
      r.watchdog_last_check_at IS NOT NULL
      AND r.watchdog_last_phase IS NOT DISTINCT FROM r.current_phase
      AND r.watchdog_last_progress IS NOT DISTINCT FROM r.phase_progress_current
      AND now() - r.watchdog_last_check_at > v_no_prog_window
    );

    v_should_kill := v_stale_tick OR v_no_progress;

    IF v_should_kill THEN
      v_reason := CASE
        WHEN v_stale_tick AND v_no_progress THEN format('sem tick há %s e sem progresso há %s', v_idle, now()-r.watchdog_last_check_at)
        WHEN v_stale_tick THEN format('sem tick há %s (>15min)', v_idle)
        ELSE format('progresso travado há %s na fase %s', now()-r.watchdog_last_check_at, r.current_phase)
      END;

      UPDATE ingestion_jobs
        SET status = 'cancelled',
            finished_at = now(),
            phase_label = 'Watchdog: ' || v_reason,
            error_message = 'Cancelado pelo watchdog: ' || v_reason
        WHERE id = r.id;

      v_restarts := COALESCE(r.watchdog_restart_count, 0);
      v_parent := COALESCE(r.watchdog_parent_job, r.id);

      IF v_restarts < v_max_restarts THEN
        -- Fallback restart: skip stuck phase by starting on 'winners' if it stalled in 'pncp',
        -- otherwise let orchestrator continue from default.
        INSERT INTO ingestion_jobs (status, current_phase, phases_total, phase_label,
                                    watchdog_restart_count, watchdog_parent_job)
        VALUES ('pending',
                CASE WHEN r.current_phase = 'pncp' THEN 'winners' ELSE r.current_phase END,
                5,
                'Reiniciado pelo watchdog (tentativa ' || (v_restarts+1) || ')',
                v_restarts + 1,
                v_parent)
        RETURNING id INTO v_new_id;

        PERFORM net.http_post(
          url := 'https://eiksdfobghixofsxskke.supabase.co/functions/v1/pipeline-orchestrator',
          headers := jsonb_build_object('Content-Type','application/json','apikey', v_anon),
          body := jsonb_build_object(
            'jobId', v_new_id,
            'internal', true,
            'source', 'watchdog-restart',
            'startPhase', CASE WHEN r.current_phase = 'pncp' THEN 'winners' ELSE r.current_phase END
          )
        );

        v_killed := v_killed || jsonb_build_object(
          'killed', r.id, 'reason', v_reason,
          'restarted_as', v_new_id, 'attempt', v_restarts + 1
        );
      ELSE
        v_killed := v_killed || jsonb_build_object(
          'killed', r.id, 'reason', v_reason,
          'restarted', false, 'note', 'limite de reinícios atingido'
        );
      END IF;
    ELSE
      -- update watchdog snapshot for next check
      UPDATE ingestion_jobs
        SET watchdog_last_progress = r.phase_progress_current,
            watchdog_last_phase = r.current_phase,
            watchdog_last_check_at = COALESCE(r.watchdog_last_check_at,
              CASE WHEN r.watchdog_last_phase IS DISTINCT FROM r.current_phase
                    OR r.watchdog_last_progress IS DISTINCT FROM r.phase_progress_current
                   THEN now() ELSE r.watchdog_last_check_at END)
        WHERE id = r.id;

      -- if progress changed since last snapshot, reset the timer
      IF r.watchdog_last_phase IS DISTINCT FROM r.current_phase
         OR r.watchdog_last_progress IS DISTINCT FROM r.phase_progress_current
         OR r.watchdog_last_check_at IS NULL THEN
        UPDATE ingestion_jobs SET watchdog_last_check_at = now() WHERE id = r.id;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('checked_at', now(), 'actions', v_killed);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ingestion_watchdog() FROM PUBLIC, anon, authenticated;
