
-- Index for date-based filtering on licitacoes
CREATE INDEX IF NOT EXISTS idx_licitacoes_data_publicacao ON licitacoes(data_publicacao);

-- Index for licitacao_vencedores created_at 
CREATE INDEX IF NOT EXISTS idx_licitacao_vencedores_created_at ON licitacao_vencedores(created_at);

-- Optimize analytics_daily_by_status with timeout and limit to avoid scanning too many rows
CREATE OR REPLACE FUNCTION analytics_daily_by_status(p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL)
RETURNS TABLE(pub_date text, situacao text, count bigint)
LANGUAGE sql STABLE
SET statement_timeout = '10s'
SET search_path = public
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

-- Optimize analytics_top_winners
CREATE OR REPLACE FUNCTION analytics_top_winners(p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL, p_limit int DEFAULT 20)
RETURNS TABLE(razao_social text, cnpj text, wins bigint, total_valor numeric)
LANGUAGE sql STABLE
SET statement_timeout = '10s'
SET search_path = public
AS $$
  SELECT
    v.razao_social,
    v.cnpj,
    COUNT(*)::bigint AS wins,
    COALESCE(SUM(v.valor_final), 0) AS total_valor
  FROM licitacao_vencedores v
  JOIN licitacao_itens i ON i.id = v.item_id
  JOIN licitacoes l ON l.id = i.licitacao_id
  WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
    AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to)
    AND v.razao_social IS NOT NULL
  GROUP BY v.razao_social, v.cnpj
  ORDER BY wins DESC, total_valor DESC
  LIMIT p_limit;
$$;

-- Optimize analytics_top_buyers
CREATE OR REPLACE FUNCTION analytics_top_buyers(p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL, p_limit int DEFAULT 20)
RETURNS TABLE(orgao text, purchases bigint, total_valor numeric)
LANGUAGE sql STABLE
SET statement_timeout = '10s'
SET search_path = public
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

-- Optimize analytics_totals
CREATE OR REPLACE FUNCTION analytics_totals(p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL)
RETURNS TABLE(total_empresas bigint, total_orgaos bigint)
LANGUAGE sql STABLE
SET statement_timeout = '10s'
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(DISTINCT v.cnpj)::bigint
     FROM licitacao_vencedores v
     JOIN licitacao_itens i ON i.id = v.item_id
     JOIN licitacoes l ON l.id = i.licitacao_id
     WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
       AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to)
       AND v.cnpj IS NOT NULL
    ) AS total_empresas,
    (SELECT COUNT(DISTINCT l.orgao)::bigint
     FROM licitacoes l
     WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
       AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to)
    ) AS total_orgaos;
$$;

-- Optimize analytics_sales_totals
CREATE OR REPLACE FUNCTION analytics_sales_totals(p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL)
RETURNS TABLE(total_sales numeric, total_contracts bigint)
LANGUAGE sql STABLE
SET statement_timeout = '10s'
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(lv.valor_final), 0) AS total_sales,
    COUNT(*)::BIGINT AS total_contracts
  FROM licitacao_vencedores lv
  WHERE (p_date_from IS NULL OR lv.created_at >= p_date_from::timestamptz)
    AND (p_date_to IS NULL OR lv.created_at < (p_date_to + 1)::timestamptz);
$$;

-- Optimize analytics_monthly_sales
CREATE OR REPLACE FUNCTION analytics_monthly_sales(p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL)
RETURNS TABLE(month text, total_valor numeric, contract_count bigint)
LANGUAGE sql STABLE
SET statement_timeout = '10s'
SET search_path = public
AS $$
  SELECT
    TO_CHAR(lv.created_at, 'YYYY-MM') AS month,
    COALESCE(SUM(lv.valor_final), 0) AS total_valor,
    COUNT(*)::BIGINT AS contract_count
  FROM licitacao_vencedores lv
  WHERE (p_date_from IS NULL OR lv.created_at >= p_date_from::timestamptz)
    AND (p_date_to IS NULL OR lv.created_at < (p_date_to + 1)::timestamptz)
  GROUP BY TO_CHAR(lv.created_at, 'YYYY-MM')
  ORDER BY month;
$$;
