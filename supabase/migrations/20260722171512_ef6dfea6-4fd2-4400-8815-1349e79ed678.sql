
-- =========================================================
-- Autoscaler state
-- =========================================================
CREATE TABLE IF NOT EXISTS public.cron_autoscale_state (
  target text PRIMARY KEY,
  limit_per_run int NOT NULL DEFAULT 400,
  parallelism int NOT NULL DEFAULT 10,
  min_limit int NOT NULL DEFAULT 100,
  max_limit int NOT NULL DEFAULT 2000,
  min_parallel int NOT NULL DEFAULT 3,
  max_parallel int NOT NULL DEFAULT 25,
  budget_ms int NOT NULL DEFAULT 120000,
  last_decision_at timestamptz,
  last_reason text,
  last_metrics jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cron_autoscale_state TO authenticated;
GRANT ALL ON public.cron_autoscale_state TO service_role;

ALTER TABLE public.cron_autoscale_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_central reads autoscale" ON public.cron_autoscale_state;
CREATE POLICY "admin_central reads autoscale"
  ON public.cron_autoscale_state FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'));

INSERT INTO public.cron_autoscale_state (target, limit_per_run, parallelism, min_limit, max_limit, min_parallel, max_parallel, budget_ms)
VALUES
  ('gaps', 800, 10, 100, 2000, 3, 25, 120000),
  ('reprocess-winners', 500, 10, 100, 1500, 3, 20, 120000)
ON CONFLICT (target) DO NOTHING;

-- =========================================================
-- Decision function
-- =========================================================
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
  n_runs int;
  new_limit int;
  new_parallel int;
  dir text;
  why text;
BEGIN
  FOR r IN SELECT * FROM public.cron_autoscale_state LOOP
    SELECT
      COUNT(*)::int,
      COALESCE(AVG((details->>'duration_ms')::numeric), 0),
      COALESCE(AVG(
        CASE WHEN records_processed > 0
          THEN LEAST(1.0, jsonb_array_length(COALESCE(details->'errors_sample','[]'::jsonb))::numeric / records_processed)
          ELSE 0 END
      ), 0),
      COALESCE(SUM((details->>'http_429')::int), 0)
    INTO n_runs, avg_ms, err_rate, h429
    FROM public.ingestao_logs
    WHERE source = 'pncp-fill-gaps'
      AND (details->>'mode') = r.target
      AND created_at > now() - interval '2 hours';

    new_limit := r.limit_per_run;
    new_parallel := r.parallelism;
    dir := 'hold';
    why := format('runs=%s avg_ms=%s err=%.2f%% 429=%s',
                  n_runs, round(avg_ms)::int, err_rate*100, h429);

    IF n_runs = 0 THEN
      why := 'no_recent_runs, hold';
    ELSIF h429 > 0 OR err_rate > 0.10 OR avg_ms > r.budget_ms * 0.9 THEN
      -- scale DOWN
      new_limit := GREATEST(r.min_limit, (r.limit_per_run * 0.7)::int);
      new_parallel := GREATEST(r.min_parallel, r.parallelism - 2);
      dir := 'down';
    ELSIF err_rate < 0.02 AND avg_ms < r.budget_ms * 0.4 AND h429 = 0 THEN
      -- scale UP
      new_limit := LEAST(r.max_limit, GREATEST(r.limit_per_run + 100, (r.limit_per_run * 1.3)::int));
      new_parallel := LEAST(r.max_parallel, r.parallelism + 2);
      dir := 'up';
    END IF;

    m := jsonb_build_object(
      'runs', n_runs,
      'avg_ms', round(avg_ms)::int,
      'err_rate', round(err_rate::numeric, 4),
      'http_429', h429,
      'direction', dir
    );

    UPDATE public.cron_autoscale_state
       SET limit_per_run = new_limit,
           parallelism = new_parallel,
           last_decision_at = now(),
           last_reason = dir || ': ' || why,
           last_metrics = m,
           updated_at = now()
     WHERE target = r.target;

    target := r.target;
    new_limit := new_limit;
    new_parallel := new_parallel;
    reason := dir || ': ' || why;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.autoscale_pncp_fill_gaps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.autoscale_pncp_fill_gaps() TO service_role;

-- =========================================================
-- Public reader used by pncp-fill-gaps to fetch its scale
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_autoscale_state(p_target text)
RETURNS TABLE(limit_per_run int, parallelism int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT limit_per_run, parallelism
  FROM public.cron_autoscale_state
  WHERE target = p_target;
$$;

GRANT EXECUTE ON FUNCTION public.get_autoscale_state(text) TO service_role, authenticated;

-- =========================================================
-- Schedule autoscaler every 15 minutes
-- =========================================================
DO $$
BEGIN
  PERFORM cron.unschedule('cron-autoscaler-pncp');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cron-autoscaler-pncp',
  '*/15 * * * *',
  $$ SELECT public.autoscale_pncp_fill_gaps(); $$
);
