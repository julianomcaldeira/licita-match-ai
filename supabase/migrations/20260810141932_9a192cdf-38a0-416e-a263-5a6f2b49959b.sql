ALTER TABLE public.ingestao_logs ADD COLUMN IF NOT EXISTS detalhes jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ingestao_logs_fonte_created ON public.ingestao_logs (fonte, created_at DESC);

CREATE OR REPLACE FUNCTION public.autoscale_pncp_fill_gaps()
 RETURNS TABLE(target text, new_limit integer, new_parallel integer, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.cron_autoscale_state%ROWTYPE;
  m jsonb;
  avg_ms numeric;
  err_rate numeric;
  h429 int;
  n_runs int;
  v_limit int;
  v_parallel int;
  dir text;
  why text;
BEGIN
  FOR r IN SELECT * FROM public.cron_autoscale_state LOOP
    SELECT
      COUNT(*)::int,
      COALESCE(AVG((detalhes->>'duration_ms')::numeric), 0),
      COALESCE(AVG(
        CASE WHEN COALESCE(registros_processados,0) > 0
          THEN LEAST(1.0, jsonb_array_length(COALESCE(detalhes->'errors_sample','[]'::jsonb))::numeric / registros_processados)
          ELSE 0 END
      ), 0),
      COALESCE(SUM((detalhes->>'http_429')::int), 0)
    INTO n_runs, avg_ms, err_rate, h429
    FROM public.ingestao_logs
    WHERE fonte = 'pncp-fill-gaps'
      AND (detalhes->>'mode') = r.target
      AND created_at > now() - interval '2 hours';

    v_limit := r.limit_per_run;
    v_parallel := r.parallelism;
    dir := 'hold';
    why := format('runs=%s avg_ms=%s err=%.2f%% 429=%s',
                  n_runs, round(avg_ms)::int, err_rate*100, h429);

    IF n_runs = 0 THEN
      why := 'no_recent_runs, hold';
    ELSIF h429 > 0 OR err_rate > 0.10 OR avg_ms > r.budget_ms * 0.9 THEN
      v_limit := GREATEST(r.min_limit, (r.limit_per_run * 0.7)::int);
      v_parallel := GREATEST(r.min_parallel, r.parallelism - 2);
      dir := 'down';
    ELSIF err_rate < 0.02 AND avg_ms < r.budget_ms * 0.4 AND h429 = 0 THEN
      v_limit := LEAST(r.max_limit, GREATEST(r.limit_per_run + 100, (r.limit_per_run * 1.3)::int));
      v_parallel := LEAST(r.max_parallel, r.parallelism + 2);
      dir := 'up';
    END IF;

    m := jsonb_build_object('runs', n_runs, 'avg_ms', round(avg_ms)::int,
                            'err_rate', round(err_rate::numeric, 4),
                            'http_429', h429, 'direction', dir);

    UPDATE public.cron_autoscale_state
       SET limit_per_run = v_limit,
           parallelism = v_parallel,
           last_decision_at = now(),
           last_reason = dir || ': ' || why,
           last_metrics = m,
           updated_at = now()
     WHERE target = r.target;

    target := r.target;
    new_limit := v_limit;
    new_parallel := v_parallel;
    reason := dir || ': ' || why;
    RETURN NEXT;
  END LOOP;
END;
$function$;

UPDATE public.cron_autoscale_state
   SET max_limit = GREATEST(max_limit, 3000),
       max_parallel = GREATEST(max_parallel, 24),
       min_limit = GREATEST(min_limit, 200)
 WHERE target IN ('gaps','reprocess-winners');

DO $alterjob$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobid = 69) THEN
    PERFORM cron.alter_job(69, schedule := '*/2 * * * *');
  END IF;
END $alterjob$;
DO $alterjob$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobid = 70) THEN
    PERFORM cron.alter_job(70, schedule := '*/5 * * * *');
  END IF;
END $alterjob$;