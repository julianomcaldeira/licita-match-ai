
CREATE OR REPLACE FUNCTION public.ai_usage_summary(
  p_period text DEFAULT '30d',
  p_empresa_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH cutoff AS (
    SELECT CASE p_period
      WHEN 'today' THEN date_trunc('day', now())
      WHEN '7d' THEN now() - interval '7 days'
      WHEN 'month' THEN date_trunc('month', now())
      ELSE now() - interval '30 days'
    END AS since
  ),
  base AS (
    SELECT l.*
    FROM public.ai_usage_log l
    WHERE l.created_at >= (SELECT since FROM cutoff)
      AND (
        p_empresa_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = l.user_id AND ur.empresa_id = p_empresa_id
        )
      )
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
    'period_totals', jsonb_build_object(
      'calls', (SELECT count(*) FROM base),
      'tokens', (SELECT COALESCE(sum(total_tokens),0) FROM base),
      'cached', (SELECT count(*) FROM base WHERE cached),
      'errors', (SELECT count(*) FROM base WHERE status <> 'success')
    ),
    'by_model', (
      SELECT COALESCE(jsonb_agg(t ORDER BY t.calls DESC), '[]'::jsonb) FROM (
        SELECT COALESCE(model,'(sem modelo)') AS model,
               count(*)::int AS calls,
               COALESCE(sum(total_tokens),0)::int AS tokens
        FROM base GROUP BY 1
      ) t
    ),
    'by_function', (
      SELECT COALESCE(jsonb_agg(t ORDER BY t.calls DESC), '[]'::jsonb) FROM (
        SELECT function_name,
               count(*)::int AS calls,
               COALESCE(sum(total_tokens),0)::int AS tokens,
               count(*) FILTER (WHERE cached)::int AS cached
        FROM base GROUP BY 1
      ) t
    ),
    'by_empresa', (
      SELECT COALESCE(jsonb_agg(t ORDER BY t.calls DESC), '[]'::jsonb) FROM (
        SELECT COALESCE(ec.nome, '(sem empresa)') AS empresa,
               ur.empresa_id,
               count(*)::int AS calls,
               COALESCE(sum(b.total_tokens),0)::int AS tokens
        FROM base b
        LEFT JOIN public.user_roles ur ON ur.user_id = b.user_id
        LEFT JOIN public.empresas_clientes ec ON ec.id = ur.empresa_id
        GROUP BY 1, 2
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

CREATE OR REPLACE FUNCTION public.ai_usage_recent(
  p_period text DEFAULT '30d',
  p_empresa_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  function_name text,
  model text,
  status text,
  cached boolean,
  total_tokens int,
  duration_ms int,
  error_message text,
  created_at timestamptz,
  empresa_nome text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH cutoff AS (
    SELECT CASE p_period
      WHEN 'today' THEN date_trunc('day', now())
      WHEN '7d' THEN now() - interval '7 days'
      WHEN 'month' THEN date_trunc('month', now())
      ELSE now() - interval '30 days'
    END AS since
  )
  SELECT l.id, l.function_name, l.model, l.status, l.cached,
         l.total_tokens, l.duration_ms, l.error_message, l.created_at,
         ec.nome AS empresa_nome
  FROM public.ai_usage_log l
  LEFT JOIN public.user_roles ur ON ur.user_id = l.user_id
  LEFT JOIN public.empresas_clientes ec ON ec.id = ur.empresa_id
  WHERE l.created_at >= (SELECT since FROM cutoff)
    AND (p_empresa_id IS NULL OR ur.empresa_id = p_empresa_id)
  ORDER BY l.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ai_usage_summary(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_recent(text, uuid, int) TO authenticated;
