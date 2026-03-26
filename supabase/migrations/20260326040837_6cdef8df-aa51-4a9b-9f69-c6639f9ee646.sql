
-- Drop duplicate text-parameter overloads that cause PostgREST ambiguity
DROP FUNCTION IF EXISTS public.analytics_top_winners(text, text, integer);
DROP FUNCTION IF EXISTS public.analytics_totals(text, text);

-- Now recreate all analytics functions as SECURITY DEFINER to bypass RLS
-- analytics_sales_totals
CREATE OR REPLACE FUNCTION public.analytics_sales_totals(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE(total_sales numeric, total_contracts bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(lv.valor_final), 0) AS total_sales,
    COUNT(*)::bigint AS total_contracts
  FROM licitacao_vencedores lv
  JOIN licitacao_itens i ON i.id = lv.item_id
  JOIN licitacoes l ON l.id = i.licitacao_id
  WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
    AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to);
$$;

-- analytics_top_winners (date params, security definer)
CREATE OR REPLACE FUNCTION public.analytics_top_winners(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE(razao_social text, cnpj text, wins bigint, total_valor numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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

-- analytics_top_buyers
CREATE OR REPLACE FUNCTION public.analytics_top_buyers(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE(orgao text, purchases bigint, total_valor numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    l.orgao,
    COUNT(DISTINCT l.id)::bigint AS purchases,
    COALESCE(SUM(l.valor_estimado), 0) AS total_valor
  FROM licitacoes l
  WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
    AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to)
  GROUP BY l.orgao
  ORDER BY purchases DESC, total_valor DESC
  LIMIT p_limit;
$$;

-- analytics_monthly_sales
CREATE OR REPLACE FUNCTION public.analytics_monthly_sales(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE(month text, total_valor numeric, contract_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(l.data_publicacao, 'YYYY-MM') AS month,
    COALESCE(SUM(v.valor_final), 0) AS total_valor,
    COUNT(*)::bigint AS contract_count
  FROM licitacao_vencedores v
  JOIN licitacao_itens i ON i.id = v.item_id
  JOIN licitacoes l ON l.id = i.licitacao_id
  WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
    AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to)
  GROUP BY TO_CHAR(l.data_publicacao, 'YYYY-MM')
  ORDER BY month;
$$;

-- analytics_daily_by_status
CREATE OR REPLACE FUNCTION public.analytics_daily_by_status(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE(pub_date text, situacao text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    l.data_publicacao::text AS pub_date,
    COALESCE(l.situacao, 'Sem status') AS situacao,
    COUNT(*)::bigint AS count
  FROM licitacoes l
  WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
    AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to)
  GROUP BY l.data_publicacao, l.situacao
  ORDER BY l.data_publicacao;
$$;

-- analytics_totals (date params only, security definer)
CREATE OR REPLACE FUNCTION public.analytics_totals(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE(total_empresas bigint, total_orgaos bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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
