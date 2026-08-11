CREATE OR REPLACE FUNCTION public.fontes_health()
RETURNS TABLE (
  fonte text,
  ultima_execucao timestamptz,
  ultimo_sucesso timestamptz,
  horas_desde_sucesso numeric,
  execucoes_24h bigint,
  erros_24h bigint,
  registros_24h bigint,
  severidade text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT l.fonte,
           max(l.created_at) AS ultima_execucao,
           max(l.created_at) FILTER (WHERE l.status IN ('sucesso','parcial','partial','completed','success')) AS ultimo_sucesso,
           count(*) FILTER (WHERE l.created_at > now() - interval '24 hours') AS execucoes_24h,
           count(*) FILTER (WHERE l.created_at > now() - interval '24 hours' AND l.status NOT IN ('sucesso','parcial','partial','completed','success','running')) AS erros_24h,
           coalesce(sum(l.registros_processados) FILTER (WHERE l.created_at > now() - interval '24 hours'), 0)::bigint AS registros_24h
    FROM public.ingestao_logs l
    WHERE l.created_at > now() - interval '7 days'
    GROUP BY l.fonte
  )
  SELECT b.fonte,
         b.ultima_execucao,
         b.ultimo_sucesso,
         round(EXTRACT(EPOCH FROM (now() - b.ultimo_sucesso)) / 3600.0, 1),
         b.execucoes_24h,
         b.erros_24h,
         b.registros_24h,
         CASE
           WHEN b.ultimo_sucesso IS NULL OR b.ultimo_sucesso < now() - interval '48 hours' THEN 'critico'
           WHEN b.ultimo_sucesso < now() - interval '30 hours' THEN 'atencao'
           WHEN b.execucoes_24h > 0 AND b.erros_24h::numeric / b.execucoes_24h > 0.3 THEN 'atencao'
           ELSE 'ok'
         END
  FROM base b
  ORDER BY 1;
$$;