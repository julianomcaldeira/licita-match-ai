CREATE OR REPLACE FUNCTION public.pncp_endpoint_budgets(p_minutes integer DEFAULT 30)
RETURNS TABLE (
  endpoint text,
  requests bigint,
  avg_latency_ms numeric,
  max_latency_ms integer,
  error_rate numeric,
  timeout_ms integer,
  max_retries integer,
  base_backoff_ms integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH agg AS (
    SELECT
      m.endpoint,
      SUM(m.requests)::bigint AS requests,
      COALESCE(SUM(m.latency_ms_sum)::numeric / NULLIF(SUM(m.requests), 0), 0) AS avg_ms,
      COALESCE(MAX(m.latency_ms_max), 0)::int AS max_ms,
      COALESCE(100.0 * SUM(m.errors) / NULLIF(SUM(m.requests), 0), 0) AS err_rate,
      COALESCE(SUM(m.aborts), 0)::numeric AS aborts
    FROM public.pncp_endpoint_metrics m
    WHERE m.bucket >= now() - make_interval(mins => GREATEST(COALESCE(p_minutes, 30), 1))
    GROUP BY m.endpoint
  )
  SELECT
    a.endpoint,
    a.requests,
    ROUND(a.avg_ms, 0),
    a.max_ms,
    ROUND(a.err_rate, 1),
    -- tempo limite: 3x a média recente, com piso no maior tempo observado,
    -- limitado entre 8s e 55s. Poucas amostras => padrão de 20s.
    LEAST(
      55000,
      GREATEST(
        8000,
        CASE
          WHEN a.requests < 5 THEN 20000
          ELSE GREATEST(CEIL(a.avg_ms * 3)::int, CEIL(a.max_ms * 1.2)::int)
        END
      )
    )::int,
    -- tentativas: menos retentativas quando o endpoint está saudável,
    -- mais quando há degradação (mas nunca acima de 4).
    CASE
      WHEN a.requests < 5 THEN 3
      WHEN a.err_rate >= 40 THEN 2      -- fonte fora do ar: não insistir
      WHEN a.err_rate >= 10 THEN 4      -- instabilidade: vale insistir
      ELSE 3
    END::int,
    -- backoff base cresce com a degradação
    CASE
      WHEN a.err_rate >= 40 THEN 4000
      WHEN a.err_rate >= 10 THEN 2500
      ELSE 1200
    END::int
  FROM agg a;
$$;

REVOKE ALL ON FUNCTION public.pncp_endpoint_budgets(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pncp_endpoint_budgets(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pncp_endpoint_budgets(integer) TO authenticated;