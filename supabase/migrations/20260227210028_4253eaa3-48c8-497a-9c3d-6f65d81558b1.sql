
-- Create missing analytics_top_winners RPC
CREATE OR REPLACE FUNCTION public.analytics_top_winners(
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE(razao_social text, cnpj text, wins bigint, total_valor numeric)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    v.razao_social,
    v.cnpj,
    COUNT(*)::bigint AS wins,
    COALESCE(SUM(v.valor_final), 0) AS total_valor
  FROM public.licitacao_vencedores v
  JOIN public.licitacao_itens i ON i.id = v.item_id
  JOIN public.licitacoes l ON l.id = i.licitacao_id
  WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from::date)
    AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to::date)
    AND v.razao_social IS NOT NULL
  GROUP BY v.razao_social, v.cnpj
  ORDER BY wins DESC, total_valor DESC
  LIMIT p_limit;
$$;

-- Create analytics_totals RPC for empresa/órgão counts
CREATE OR REPLACE FUNCTION public.analytics_totals(
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL
)
RETURNS TABLE(total_empresas bigint, total_orgaos bigint)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT COUNT(DISTINCT v.cnpj)::bigint
     FROM public.licitacao_vencedores v
     JOIN public.licitacao_itens i ON i.id = v.item_id
     JOIN public.licitacoes l ON l.id = i.licitacao_id
     WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from::date)
       AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to::date)
       AND v.cnpj IS NOT NULL
    ) AS total_empresas,
    (SELECT COUNT(DISTINCT l.orgao)::bigint
     FROM public.licitacoes l
     WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from::date)
       AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to::date)
    ) AS total_orgaos;
$$;
