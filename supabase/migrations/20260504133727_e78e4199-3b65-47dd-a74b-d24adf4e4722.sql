
-- 1) Reset cursor to continue from where daily stopped (2024-01-04)
UPDATE sync_status
SET last_date_processed = '20240104', updated_at = now()
WHERE api_source = 'pncp-dadosabertos-backfill' AND modalidade = 0;

-- 2) Fast tick: dispatch 4 windows of 30 days in parallel per call
CREATE OR REPLACE FUNCTION public.pncp_dadosabertos_backfill_fast_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cursor TEXT;
  v_today  TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD');
  v_start  TEXT;
  v_end    TEXT;
  v_anon   TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3NkZm9iZ2hpeG9mc3hza2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzY0MzcsImV4cCI6MjA4NzU1MjQzN30.30O_CNCvL_WpoL0a40oKILdQyt9cY1ZXPZYw_ogeecc';
  v_dispatched int := 0;
  v_windows jsonb := '[]'::jsonb;
  i int;
BEGIN
  SELECT last_date_processed INTO v_cursor
  FROM sync_status
  WHERE api_source = 'pncp-dadosabertos-backfill' AND modalidade = 0
  FOR UPDATE;

  IF v_cursor IS NULL OR v_cursor = '' THEN
    v_cursor := '20240104';
  END IF;

  FOR i IN 1..4 LOOP
    v_start := to_char((to_date(v_cursor,'YYYYMMDD') + 1), 'YYYYMMDD');
    IF v_start >= v_today THEN
      EXIT;
    END IF;
    v_end := to_char((to_date(v_cursor,'YYYYMMDD') + 30), 'YYYYMMDD');
    IF v_end > v_today THEN v_end := v_today; END IF;

    PERFORM net.http_post(
      url := 'https://eiksdfobghixofsxskke.supabase.co/functions/v1/internal-cron-dispatcher',
      headers := jsonb_build_object('Content-Type','application/json','apikey', v_anon),
      body := jsonb_build_object(
        'target','ingest-pncp-dadosabertos',
        'payload', jsonb_build_object('mode','backfill','dataInicial',v_start,'dataFinal',v_end)
      )
    );

    v_windows := v_windows || jsonb_build_object('inicio',v_start,'fim',v_end);
    v_cursor := v_end;
    v_dispatched := v_dispatched + 1;
  END LOOP;

  UPDATE sync_status
     SET last_date_processed = v_cursor, updated_at = now()
   WHERE api_source = 'pncp-dadosabertos-backfill' AND modalidade = 0;

  RETURN jsonb_build_object('dispatched', v_dispatched, 'cursor', v_cursor, 'windows', v_windows);
END;
$$;
