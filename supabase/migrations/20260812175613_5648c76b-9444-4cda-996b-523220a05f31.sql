CREATE TABLE IF NOT EXISTS public.pncp_endpoint_metrics (
  bucket timestamptz NOT NULL,
  endpoint text NOT NULL,
  function_name text NOT NULL,
  requests integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  aborts integer NOT NULL DEFAULT 0,
  retries integer NOT NULL DEFAULT 0,
  http_429 integer NOT NULL DEFAULT 0,
  http_4xx integer NOT NULL DEFAULT 0,
  http_5xx integer NOT NULL DEFAULT 0,
  latency_ms_sum bigint NOT NULL DEFAULT 0,
  latency_ms_max integer NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, endpoint, function_name)
);

CREATE INDEX IF NOT EXISTS idx_pncp_endpoint_metrics_bucket ON public.pncp_endpoint_metrics (bucket DESC);

GRANT SELECT ON public.pncp_endpoint_metrics TO authenticated;
GRANT ALL ON public.pncp_endpoint_metrics TO service_role;

ALTER TABLE public.pncp_endpoint_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read pncp endpoint metrics" ON public.pncp_endpoint_metrics;
CREATE POLICY "admins read pncp endpoint metrics"
  ON public.pncp_endpoint_metrics FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'));

-- Registro em lote (chamado pelas edge functions com service_role)
CREATE OR REPLACE FUNCTION public.pncp_metrics_record(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pncp_endpoint_metrics AS m (
    bucket, endpoint, function_name, requests, errors, aborts, retries,
    http_429, http_4xx, http_5xx, latency_ms_sum, latency_ms_max, last_error
  )
  SELECT
    date_trunc('minute', COALESCE((r->>'bucket')::timestamptz, now())),
    left(COALESCE(r->>'endpoint','desconhecido'), 120),
    left(COALESCE(r->>'function_name','desconhecida'), 60),
    COALESCE((r->>'requests')::int, 0),
    COALESCE((r->>'errors')::int, 0),
    COALESCE((r->>'aborts')::int, 0),
    COALESCE((r->>'retries')::int, 0),
    COALESCE((r->>'http_429')::int, 0),
    COALESCE((r->>'http_4xx')::int, 0),
    COALESCE((r->>'http_5xx')::int, 0),
    COALESCE((r->>'latency_ms_sum')::bigint, 0),
    COALESCE((r->>'latency_ms_max')::int, 0),
    left(NULLIF(r->>'last_error',''), 300)
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS r
  ON CONFLICT (bucket, endpoint, function_name) DO UPDATE SET
    requests = m.requests + EXCLUDED.requests,
    errors = m.errors + EXCLUDED.errors,
    aborts = m.aborts + EXCLUDED.aborts,
    retries = m.retries + EXCLUDED.retries,
    http_429 = m.http_429 + EXCLUDED.http_429,
    http_4xx = m.http_4xx + EXCLUDED.http_4xx,
    http_5xx = m.http_5xx + EXCLUDED.http_5xx,
    latency_ms_sum = m.latency_ms_sum + EXCLUDED.latency_ms_sum,
    latency_ms_max = GREATEST(m.latency_ms_max, EXCLUDED.latency_ms_max),
    last_error = COALESCE(EXCLUDED.last_error, m.last_error),
    updated_at = now();

  -- retenção curta: 7 dias
  IF random() < 0.02 THEN
    DELETE FROM public.pncp_endpoint_metrics WHERE bucket < now() - interval '7 days';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.pncp_metrics_record(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pncp_metrics_record(jsonb) TO service_role;

-- Resumo por endpoint (janela em minutos)
CREATE OR REPLACE FUNCTION public.pncp_endpoint_metrics_summary(p_minutes integer DEFAULT 60)
RETURNS TABLE (
  endpoint text,
  function_name text,
  requests bigint,
  errors bigint,
  aborts bigint,
  retries bigint,
  http_429 bigint,
  http_4xx bigint,
  http_5xx bigint,
  error_rate numeric,
  avg_latency_ms numeric,
  max_latency_ms integer,
  last_error text,
  last_seen timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.endpoint,
    m.function_name,
    SUM(m.requests)::bigint,
    SUM(m.errors)::bigint,
    SUM(m.aborts)::bigint,
    SUM(m.retries)::bigint,
    SUM(m.http_429)::bigint,
    SUM(m.http_4xx)::bigint,
    SUM(m.http_5xx)::bigint,
    ROUND(100.0 * SUM(m.errors) / NULLIF(SUM(m.requests), 0), 1),
    ROUND(SUM(m.latency_ms_sum)::numeric / NULLIF(SUM(m.requests), 0), 0),
    MAX(m.latency_ms_max)::int,
    (ARRAY_REMOVE(ARRAY_AGG(m.last_error ORDER BY m.bucket DESC), NULL))[1],
    MAX(m.updated_at)
  FROM public.pncp_endpoint_metrics m
  WHERE m.bucket >= now() - make_interval(mins => GREATEST(COALESCE(p_minutes, 60), 1))
    AND public.has_role(auth.uid(), 'admin_central')
  GROUP BY m.endpoint, m.function_name
  ORDER BY SUM(m.requests) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.pncp_endpoint_metrics_summary(integer) TO authenticated, service_role;

-- Série temporal agregada (por minuto) para gráfico em tempo real
CREATE OR REPLACE FUNCTION public.pncp_endpoint_metrics_timeline(p_minutes integer DEFAULT 60)
RETURNS TABLE (
  bucket timestamptz,
  requests bigint,
  errors bigint,
  aborts bigint,
  retries bigint,
  avg_latency_ms numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.bucket,
    SUM(m.requests)::bigint,
    SUM(m.errors)::bigint,
    SUM(m.aborts)::bigint,
    SUM(m.retries)::bigint,
    ROUND(SUM(m.latency_ms_sum)::numeric / NULLIF(SUM(m.requests), 0), 0)
  FROM public.pncp_endpoint_metrics m
  WHERE m.bucket >= now() - make_interval(mins => GREATEST(COALESCE(p_minutes, 60), 1))
    AND public.has_role(auth.uid(), 'admin_central')
  GROUP BY m.bucket
  ORDER BY m.bucket;
$$;

GRANT EXECUTE ON FUNCTION public.pncp_endpoint_metrics_timeline(integer) TO authenticated, service_role;