
CREATE OR REPLACE FUNCTION public.autoscale_pncp_fill_gaps()
RETURNS TABLE(target text, new_limit int, new_parallel int, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.cron_autoscale_state%ROWTYPE;
  m jsonb;
  avg_ms numeric;
  err_rate numeric;
  h429 int;
  proc int;
  r429 numeric;
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
      COALESCE(SUM((detalhes->>'http_429')::int), 0),
      COALESCE(SUM(registros_processados), 0)
    INTO n_runs, avg_ms, err_rate, h429, proc
    FROM public.ingestao_logs
    WHERE fonte = 'pncp-fill-gaps'
      AND (detalhes->>'mode') = r.target
      AND created_at > now() - interval '30 minutes';

    r429 := CASE WHEN proc > 0 THEN h429::numeric / proc ELSE 0 END;

    v_limit := r.limit_per_run;
    v_parallel := r.parallelism;
    dir := 'hold';
    why := format('runs=%s proc=%s avg_ms=%s 429/rec=%.2f',
                  n_runs, proc, round(avg_ms)::int, r429);

    IF n_runs = 0 THEN
      why := 'no_recent_runs, hold';
    ELSIF r429 > 4 OR err_rate > 0.25 THEN
      v_limit := GREATEST(r.min_limit, (r.limit_per_run * 0.8)::int);
      v_parallel := GREATEST(r.min_parallel, r.parallelism - 2);
      dir := 'down';
    ELSIF r429 < 1.5 AND err_rate < 0.10 THEN
      v_limit := LEAST(r.max_limit, GREATEST(r.limit_per_run + 200, (r.limit_per_run * 1.2)::int));
      v_parallel := LEAST(r.max_parallel, r.parallelism + 2);
      dir := 'up';
    END IF;

    m := jsonb_build_object('runs', n_runs, 'avg_ms', round(avg_ms)::int,
                            'err_rate', round(err_rate::numeric, 4),
                            'http_429', h429, 'per_rec_429', round(r429, 2),
                            'direction', dir);

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
$$;
