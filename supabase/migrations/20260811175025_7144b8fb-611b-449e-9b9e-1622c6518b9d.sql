-- 1) Refresh adaptativo da fila de lacunas
CREATE OR REPLACE FUNCTION public.refresh_pncp_gap_queue_adaptive(p_max_pending bigint DEFAULT 150000)
RETURNS TABLE(ran boolean, pending_before bigint, inserted bigint, cleaned bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '900s'
AS $$
DECLARE
  v_pending bigint;
  v_ins bigint := 0;
  v_del bigint := 0;
BEGIN
  SELECT count(*) INTO v_pending FROM public.pncp_gap_queue WHERE status = 'pending';
  IF v_pending > p_max_pending THEN
    RETURN QUERY SELECT false, v_pending, 0::bigint, 0::bigint;
    RETURN;
  END IF;
  SELECT r.inserted, r.cleaned INTO v_ins, v_del FROM public.refresh_pncp_gap_queue(2023) r;
  RETURN QUERY SELECT true, v_pending, v_ins, v_del;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_pncp_gap_queue_adaptive(bigint) FROM PUBLIC, anon, authenticated;

-- 2) Saúde por fonte de dados
CREATE OR REPLACE FUNCTION public.fontes_health()
RETURNS TABLE(
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
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT l.fonte,
           max(l.created_at) AS ultima_execucao,
           max(l.created_at) FILTER (WHERE l.status = 'sucesso') AS ultimo_sucesso,
           count(*) FILTER (WHERE l.created_at > now() - interval '24 hours') AS execucoes_24h,
           count(*) FILTER (WHERE l.created_at > now() - interval '24 hours' AND l.status <> 'sucesso') AS erros_24h,
           coalesce(sum(l.registros_processados) FILTER (WHERE l.created_at > now() - interval '24 hours'), 0)::bigint AS registros_24h
    FROM public.ingestao_logs l
    WHERE l.created_at > now() - interval '7 days'
    GROUP BY l.fonte
  )
  SELECT b.fonte,
         b.ultima_execucao,
         b.ultimo_sucesso,
         round(EXTRACT(EPOCH FROM (now() - b.ultimo_sucesso)) / 3600.0, 1) AS horas_desde_sucesso,
         b.execucoes_24h,
         b.erros_24h,
         b.registros_24h,
         CASE
           WHEN b.ultimo_sucesso IS NULL OR b.ultimo_sucesso < now() - interval '48 hours' THEN 'critico'
           WHEN b.ultimo_sucesso < now() - interval '26 hours' THEN 'atencao'
           WHEN b.execucoes_24h > 0 AND b.erros_24h::numeric / b.execucoes_24h > 0.5 THEN 'atencao'
           ELSE 'ok'
         END AS severidade
  FROM base b
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.fontes_health() TO authenticated;

-- 3) Cron adaptativo a cada 5 minutos
SELECT cron.schedule(
  'pncp-gap-queue-refresh-adaptive',
  '*/5 * * * *',
  $cron$ SELECT public.refresh_pncp_gap_queue_adaptive(150000); $cron$
);