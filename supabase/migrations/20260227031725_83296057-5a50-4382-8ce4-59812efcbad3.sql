
-- Fix: Top 20 órgãos compradores (date to date comparison)
CREATE OR REPLACE FUNCTION public.analytics_top_buyers(
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  orgao TEXT,
  purchases BIGINT,
  total_valor NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    l.orgao,
    COUNT(DISTINCT l.id)::BIGINT AS purchases,
    COALESCE(SUM(DISTINCT l.valor_estimado), 0) AS total_valor
  FROM licitacoes l
  INNER JOIN licitacao_itens li ON li.licitacao_id = l.id
  INNER JOIN licitacao_vencedores lv ON lv.item_id = li.id
  WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
    AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to)
  GROUP BY l.orgao
  ORDER BY purchases DESC
  LIMIT p_limit;
$$;

-- Fix: Licitações diárias por status (date comparison)
CREATE OR REPLACE FUNCTION public.analytics_daily_by_status(
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE (
  pub_date TEXT,
  situacao TEXT,
  count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    l.data_publicacao::text AS pub_date,
    COALESCE(l.situacao, 'Sem status') AS situacao,
    COUNT(*)::BIGINT AS count
  FROM licitacoes l
  WHERE l.data_publicacao IS NOT NULL
    AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
    AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to)
  GROUP BY l.data_publicacao, l.situacao
  ORDER BY l.data_publicacao;
$$;
