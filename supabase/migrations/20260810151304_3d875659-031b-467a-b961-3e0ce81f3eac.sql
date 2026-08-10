DROP FUNCTION IF EXISTS public.cobertura_resumo();
CREATE FUNCTION public.cobertura_resumo()
RETURNS TABLE(
  total_no_sistema bigint,
  gaps bigint,
  orgaos_com_gap bigint,
  homologadas_sem_vencedores bigint,
  faltando_total bigint,
  pct_cobertura numeric,
  ingeridas_24h bigint,
  ingeridas_7d bigint,
  velocidade_dia numeric,
  eta_dias numeric,
  ultima_ingestao timestamp with time zone,
  fila_atualizada_em timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '60s'
AS $$
DECLARE
  v_total bigint;
  v_gaps bigint := 0;
  v_orgaos bigint := 0;
  v_repro bigint := 0;
  v_24h bigint;
  v_7d bigint;
  v_vel numeric;
  v_falta bigint;
  v_last timestamptz;
  v_fila timestamptz;
BEGIN
  SELECT count(*) INTO v_total FROM licitacoes;

  SELECT q.pending + q.processing, q.orgaos
    INTO v_gaps, v_orgaos
  FROM gap_queue_summary() q;

  SELECT max(updated_at) INTO v_fila FROM pncp_gap_queue;

  SELECT r.total INTO v_repro FROM pncp_reprocess_summary() r;
  SELECT count(*) INTO v_24h FROM licitacoes WHERE created_at > now() - interval '24 hours';
  SELECT count(*) INTO v_7d FROM licitacoes WHERE created_at > now() - interval '7 days';
  SELECT max(created_at) INTO v_last FROM licitacoes;

  v_vel := GREATEST(COALESCE(v_24h,0)::numeric, COALESCE(v_7d,0)::numeric / 7.0);
  v_falta := COALESCE(v_gaps,0) + COALESCE(v_repro,0);

  RETURN QUERY SELECT
    v_total,
    COALESCE(v_gaps,0),
    COALESCE(v_orgaos,0),
    COALESCE(v_repro,0),
    v_falta,
    CASE WHEN v_total + v_falta > 0
      THEN round(100.0 * v_total / (v_total + v_falta), 1) ELSE 100 END,
    COALESCE(v_24h,0),
    COALESCE(v_7d,0),
    v_vel,
    CASE WHEN v_vel > 0 THEN round(v_falta / v_vel, 0) ELSE NULL END,
    v_last,
    v_fila;
END;
$$;

REVOKE ALL ON FUNCTION public.cobertura_resumo() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cobertura_resumo() TO authenticated, service_role;