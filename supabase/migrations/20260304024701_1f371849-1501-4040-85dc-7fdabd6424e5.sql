
-- Create indexes to speed up the empresas query
CREATE INDEX IF NOT EXISTS idx_licitacao_vencedores_razao_social ON public.licitacao_vencedores (razao_social);
CREATE INDEX IF NOT EXISTS idx_licitacao_vencedores_cnpj ON public.licitacao_vencedores (cnpj);

-- Rewrite list_empresas_vencedoras to avoid the expensive triple join for count
-- Use a two-pass approach: first get the aggregated data, then count
CREATE OR REPLACE FUNCTION public.list_empresas_vencedoras(
  p_search text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  razao_social text,
  cnpj text,
  uf text,
  municipio text,
  total_vitorias bigint,
  total_count bigint
)
LANGUAGE plpgsql STABLE
SET statement_timeout = '30s'
SET search_path = public
AS $$
DECLARE
  v_total bigint;
BEGIN
  -- First get total count with a simpler query
  SELECT count(*) INTO v_total
  FROM (
    SELECT v.razao_social, v.cnpj, l.uf, l.municipio
    FROM licitacao_vencedores v
    JOIN licitacao_itens i ON i.id = v.item_id
    JOIN licitacoes l ON l.id = i.licitacao_id
    WHERE (p_search IS NULL OR v.razao_social ILIKE '%' || p_search || '%' OR v.cnpj ILIKE '%' || p_search || '%')
      AND (p_uf IS NULL OR l.uf = p_uf)
    GROUP BY v.razao_social, v.cnpj, l.uf, l.municipio
  ) sub;

  RETURN QUERY
  SELECT
    COALESCE(v.razao_social, 'Não informado'),
    COALESCE(v.cnpj, 'N/I'),
    COALESCE(l.uf, 'N/I'),
    COALESCE(l.municipio, 'N/I'),
    count(*)::bigint,
    v_total
  FROM licitacao_vencedores v
  JOIN licitacao_itens i ON i.id = v.item_id
  JOIN licitacoes l ON l.id = i.licitacao_id
  WHERE (p_search IS NULL OR v.razao_social ILIKE '%' || p_search || '%' OR v.cnpj ILIKE '%' || p_search || '%')
    AND (p_uf IS NULL OR l.uf = p_uf)
  GROUP BY v.razao_social, v.cnpj, l.uf, l.municipio
  ORDER BY count(*) DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Also optimize list_orgaos similarly  
CREATE OR REPLACE FUNCTION public.list_orgaos(
  p_search text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  orgao text,
  uf text,
  municipio text,
  total_licitacoes bigint,
  total_count bigint
)
LANGUAGE plpgsql STABLE
SET statement_timeout = '30s'
SET search_path = public
AS $$
DECLARE
  v_total bigint;
BEGIN
  SELECT count(*) INTO v_total
  FROM (
    SELECT l.orgao, l.uf, l.municipio
    FROM licitacoes l
    WHERE (p_search IS NULL OR l.orgao ILIKE '%' || p_search || '%')
      AND (p_uf IS NULL OR l.uf = p_uf)
    GROUP BY l.orgao, l.uf, l.municipio
  ) sub;

  RETURN QUERY
  SELECT
    l.orgao,
    COALESCE(l.uf, 'N/I'),
    COALESCE(l.municipio, 'N/I'),
    count(*)::bigint,
    v_total
  FROM licitacoes l
  WHERE (p_search IS NULL OR l.orgao ILIKE '%' || p_search || '%')
    AND (p_uf IS NULL OR l.uf = p_uf)
  GROUP BY l.orgao, l.uf, l.municipio
  ORDER BY count(*) DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
