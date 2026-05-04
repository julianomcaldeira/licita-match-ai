-- Corrige RPCs do dashboard para usar valor_homologado (fonte da verdade) e evitar inflação por itens

-- 1) Sales totals: soma valor_homologado direto da licitação; count = licitações homologadas distintas
CREATE OR REPLACE FUNCTION public.analytics_sales_totals(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE(total_sales numeric, total_contracts bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(SUM(l.valor_homologado), 0) AS total_sales,
    COUNT(*) FILTER (WHERE COALESCE(l.valor_homologado,0) > 0)::bigint AS total_contracts
  FROM licitacoes l
  WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
    AND (p_date_to   IS NULL OR l.data_publicacao <= p_date_to);
$$;

-- 2) Totals: empresas distintas (vencedores conhecidos) + órgãos distintos (de licitações homologadas)
CREATE OR REPLACE FUNCTION public.analytics_totals(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE(total_empresas bigint, total_orgaos bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    (SELECT COUNT(DISTINCT v.cnpj)::bigint
       FROM licitacao_vencedores v
       JOIN licitacao_itens i ON i.id = v.item_id
       JOIN licitacoes l ON l.id = i.licitacao_id
      WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
        AND (p_date_to   IS NULL OR l.data_publicacao <= p_date_to)
        AND v.cnpj IS NOT NULL),
    (SELECT COUNT(DISTINCT l.orgao)::bigint
       FROM licitacoes l
      WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
        AND (p_date_to   IS NULL OR l.data_publicacao <= p_date_to)
        AND l.orgao IS NOT NULL);
$$;

-- 3) Top buyers: agora usando valor_homologado (consistente com Volume Financeiro)
CREATE OR REPLACE FUNCTION public.analytics_top_buyers(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE(orgao text, purchases bigint, total_valor numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    l.orgao,
    COUNT(*)::bigint AS purchases,
    COALESCE(SUM(l.valor_homologado), 0) AS total_valor
  FROM licitacoes l
  WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
    AND (p_date_to   IS NULL OR l.data_publicacao <= p_date_to)
    AND l.orgao IS NOT NULL
  GROUP BY l.orgao
  ORDER BY total_valor DESC NULLS LAST, purchases DESC
  LIMIT p_limit;
$$;

-- 4) Top winners: contar LICITAÇÕES distintas (não itens) e somar valor_final apenas dos vencedores conhecidos
CREATE OR REPLACE FUNCTION public.analytics_top_winners(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE(razao_social text, cnpj text, wins bigint, total_valor numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH per_lic AS (
    SELECT
      v.razao_social,
      v.cnpj,
      i.licitacao_id,
      SUM(v.valor_final) AS valor_lic
    FROM licitacao_vencedores v
    JOIN licitacao_itens i ON i.id = v.item_id
    JOIN licitacoes l ON l.id = i.licitacao_id
    WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
      AND (p_date_to   IS NULL OR l.data_publicacao <= p_date_to)
      AND v.razao_social IS NOT NULL
    GROUP BY v.razao_social, v.cnpj, i.licitacao_id
  )
  SELECT razao_social, cnpj,
         COUNT(*)::bigint AS wins,
         COALESCE(SUM(valor_lic), 0) AS total_valor
  FROM per_lic
  GROUP BY razao_social, cnpj
  ORDER BY wins DESC, total_valor DESC NULLS LAST
  LIMIT p_limit;
$$;

-- 5) Monthly sales: também migra para valor_homologado para consistência
CREATE OR REPLACE FUNCTION public.analytics_monthly_sales(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE(month text, total_valor numeric, contract_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    TO_CHAR(l.data_publicacao, 'YYYY-MM') AS month,
    COALESCE(SUM(l.valor_homologado), 0) AS total_valor,
    COUNT(*) FILTER (WHERE COALESCE(l.valor_homologado,0) > 0)::bigint AS contract_count
  FROM licitacoes l
  WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
    AND (p_date_to   IS NULL OR l.data_publicacao <= p_date_to)
  GROUP BY TO_CHAR(l.data_publicacao, 'YYYY-MM')
  ORDER BY month;
$$;