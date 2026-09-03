-- Admin Central · Tela 3 (Financeiro) — Parte G-BIS.1 da especificacao.
-- MRR normaliza plano anual dividindo por 12; mensal (ou ciclo desconhecido) conta cheio.
-- Novos/cancelados do mes usam updated_at como proxy de "quando mudou de status" —
-- nao existe historico de eventos de assinatura, so o estado atual. Documentar
-- essa limitacao na UI, nao esconder.
-- Receita de creditos e NFS-e ficam de fora: dependem da tabela `pagamentos`
-- (Parte C.5), que ainda nao existe. Retornar null em vez de inventar numero.

CREATE OR REPLACE FUNCTION public.admin_financeiro_overview()
RETURNS TABLE (
  mrr_total_centavos bigint,
  mrr_por_plano jsonb,
  ativos_total bigint,
  novas_assinaturas_mes bigint,
  canceladas_mes bigint,
  churn_logo_pct numeric,
  churn_receita_pct numeric,
  inadimplentes_qtd bigint,
  inadimplentes_mrr_centavos bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mes_atual timestamptz := date_trunc('month', now());
BEGIN
  IF NOT has_role(auth.uid(), 'admin_central'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH mrr_linha AS (
    SELECT
      a.id,
      a.status,
      a.inicio,
      a.updated_at,
      p.codigo AS plano_codigo,
      p.nome AS plano_nome,
      CASE WHEN p.ciclo = 'anual' THEN (p.preco_centavos / 12.0) ELSE p.preco_centavos::numeric END AS mrr_centavos
    FROM assinaturas a
    JOIN planos p ON p.id = a.plano_id
  ),
  ativos AS (
    SELECT * FROM mrr_linha WHERE status IN ('ativa', 'inadimplente')
  ),
  ativos_inicio_mes AS (
    -- aproximacao: assinaturas que ja existiam antes do inicio do mes e ainda
    -- nao foram canceladas ate agora (sem historico de status, nao ha jeito exato)
    SELECT * FROM mrr_linha
    WHERE inicio < mes_atual
      AND NOT (status = 'cancelada' AND updated_at < mes_atual)
  ),
  por_plano AS (
    SELECT
      plano_codigo,
      plano_nome,
      SUM(mrr_centavos)::bigint AS mrr_centavos,
      COUNT(*)::bigint AS quantidade
    FROM ativos
    GROUP BY plano_codigo, plano_nome
  ),
  novas AS (
    SELECT COUNT(*)::bigint AS qtd
    FROM mrr_linha
    WHERE inicio >= mes_atual
  ),
  canceladas AS (
    SELECT COUNT(*)::bigint AS qtd, COALESCE(SUM(mrr_centavos), 0)::bigint AS mrr_perdido
    FROM mrr_linha
    WHERE status = 'cancelada' AND updated_at >= mes_atual
  ),
  inadimplentes AS (
    SELECT COUNT(*)::bigint AS qtd, COALESCE(SUM(mrr_centavos), 0)::bigint AS mrr
    FROM mrr_linha
    WHERE status = 'inadimplente'
  )
  SELECT
    COALESCE((SELECT SUM(mrr_centavos)::bigint FROM ativos), 0),
    COALESCE((SELECT jsonb_agg(por_plano) FROM por_plano), '[]'::jsonb),
    COALESCE((SELECT COUNT(*)::bigint FROM ativos), 0),
    COALESCE((SELECT qtd FROM novas), 0),
    COALESCE((SELECT qtd FROM canceladas), 0),
    CASE WHEN (SELECT COUNT(*) FROM ativos_inicio_mes) > 0
      THEN ROUND((SELECT qtd FROM canceladas)::numeric / (SELECT COUNT(*) FROM ativos_inicio_mes) * 100, 2)
      ELSE 0 END,
    CASE WHEN (SELECT COALESCE(SUM(mrr_centavos), 0) FROM ativos_inicio_mes) > 0
      THEN ROUND((SELECT mrr_perdido FROM canceladas)::numeric / (SELECT SUM(mrr_centavos) FROM ativos_inicio_mes) * 100, 2)
      ELSE 0 END,
    COALESCE((SELECT qtd FROM inadimplentes), 0),
    COALESCE((SELECT mrr FROM inadimplentes), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_financeiro_overview() TO authenticated;
