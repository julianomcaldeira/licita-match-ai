
CREATE OR REPLACE FUNCTION public.cobertura_resumo()
RETURNS TABLE (
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
  ultima_ingestao timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
BEGIN
  SELECT count(*) INTO v_total FROM licitacoes;
  SELECT g.total_gaps, g.orgaos_com_gap INTO v_gaps, v_orgaos FROM pncp_gaps_summary(2023) g;
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
    CASE WHEN (v_total + COALESCE(v_gaps,0)) > 0
      THEN round((v_total::numeric / (v_total + COALESCE(v_gaps,0))::numeric) * 100, 1)
      ELSE 100 END,
    COALESCE(v_24h,0),
    COALESCE(v_7d,0),
    round(v_vel, 1),
    CASE WHEN v_vel > 0 THEN round(v_falta::numeric / v_vel, 0) ELSE NULL END,
    v_last;
END;
$$;

REVOKE ALL ON FUNCTION public.cobertura_resumo() FROM public;
GRANT EXECUTE ON FUNCTION public.cobertura_resumo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cobertura_resumo() TO service_role;
