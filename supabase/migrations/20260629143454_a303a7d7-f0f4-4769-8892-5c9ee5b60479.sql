
CREATE TABLE public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  model text,
  user_id uuid,
  status text NOT NULL DEFAULT 'success',
  cached boolean NOT NULL DEFAULT false,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  duration_ms integer,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_usage_log TO authenticated;
GRANT ALL ON public.ai_usage_log TO service_role;

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_central reads ai usage" ON public.ai_usage_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'));

CREATE POLICY "service role manages ai usage" ON public.ai_usage_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_ai_usage_log_created ON public.ai_usage_log (created_at DESC);
CREATE INDEX idx_ai_usage_log_function ON public.ai_usage_log (function_name, created_at DESC);
CREATE INDEX idx_ai_usage_log_model ON public.ai_usage_log (model, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_usage_log;
ALTER TABLE public.ai_usage_log REPLICA IDENTITY FULL;

-- KPIs agregados (24h, 7d, 30d) para o dashboard
CREATE OR REPLACE FUNCTION public.ai_usage_summary()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT * FROM public.ai_usage_log WHERE created_at >= now() - interval '30 days'
  )
  SELECT jsonb_build_object(
    'today', jsonb_build_object(
      'calls', (SELECT count(*) FROM base WHERE created_at >= date_trunc('day', now())),
      'tokens', (SELECT COALESCE(sum(total_tokens),0) FROM base WHERE created_at >= date_trunc('day', now())),
      'cached', (SELECT count(*) FROM base WHERE created_at >= date_trunc('day', now()) AND cached),
      'errors', (SELECT count(*) FROM base WHERE created_at >= date_trunc('day', now()) AND status <> 'success')
    ),
    'last_7d', jsonb_build_object(
      'calls', (SELECT count(*) FROM base WHERE created_at >= now() - interval '7 days'),
      'tokens', (SELECT COALESCE(sum(total_tokens),0) FROM base WHERE created_at >= now() - interval '7 days')
    ),
    'last_30d', jsonb_build_object(
      'calls', (SELECT count(*) FROM base),
      'tokens', (SELECT COALESCE(sum(total_tokens),0) FROM base)
    ),
    'by_model', (
      SELECT COALESCE(jsonb_agg(t ORDER BY t.calls DESC), '[]'::jsonb) FROM (
        SELECT COALESCE(model,'(sem modelo)') AS model,
               count(*)::int AS calls,
               COALESCE(sum(total_tokens),0)::int AS tokens
        FROM base WHERE created_at >= now() - interval '7 days'
        GROUP BY 1
      ) t
    ),
    'by_function', (
      SELECT COALESCE(jsonb_agg(t ORDER BY t.calls DESC), '[]'::jsonb) FROM (
        SELECT function_name,
               count(*)::int AS calls,
               COALESCE(sum(total_tokens),0)::int AS tokens,
               count(*) FILTER (WHERE cached)::int AS cached
        FROM base WHERE created_at >= now() - interval '7 days'
        GROUP BY 1
      ) t
    ),
    'hourly_24h', (
      SELECT COALESCE(jsonb_agg(t ORDER BY t.hour), '[]'::jsonb) FROM (
        SELECT to_char(date_trunc('hour', created_at), 'YYYY-MM-DD"T"HH24:00') AS hour,
               count(*)::int AS calls,
               COALESCE(sum(total_tokens),0)::int AS tokens
        FROM base WHERE created_at >= now() - interval '24 hours'
        GROUP BY 1
      ) t
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.ai_usage_summary() TO authenticated;
