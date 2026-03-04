
-- Create materialized view with pre-aggregated winner data
CREATE MATERIALIZED VIEW public.mv_empresas_vencedoras AS
SELECT
  v.razao_social,
  v.cnpj,
  l.uf,
  l.municipio,
  COUNT(*) AS total_vitorias
FROM licitacao_vencedores v
JOIN licitacao_itens i ON i.id = v.item_id
JOIN licitacoes l ON l.id = i.licitacao_id
WHERE v.razao_social IS NOT NULL AND v.cnpj IS NOT NULL
GROUP BY v.razao_social, v.cnpj, l.uf, l.municipio;

-- Create indexes on the materialized view
CREATE INDEX idx_mv_emp_razao ON public.mv_empresas_vencedoras (razao_social);
CREATE INDEX idx_mv_emp_cnpj ON public.mv_empresas_vencedoras (cnpj);
CREATE INDEX idx_mv_emp_uf ON public.mv_empresas_vencedoras (uf);
CREATE INDEX idx_mv_emp_vitorias ON public.mv_empresas_vencedoras (total_vitorias DESC);
CREATE INDEX idx_mv_emp_razao_trgm ON public.mv_empresas_vencedoras USING gin (razao_social gin_trgm_ops);

-- Replace the function to query from materialized view
CREATE OR REPLACE FUNCTION public.list_empresas_vencedoras(
  p_search text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_limit int DEFAULT 50,
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
SET statement_timeout = '10s'
SET search_path = public
AS $$
DECLARE
  v_total bigint;
BEGIN
  SELECT count(*) INTO v_total
  FROM mv_empresas_vencedoras m
  WHERE (p_uf IS NULL OR m.uf = p_uf)
    AND (p_search IS NULL OR m.razao_social ILIKE '%' || p_search || '%' OR m.cnpj ILIKE '%' || p_search || '%');

  RETURN QUERY
  SELECT
    m.razao_social,
    m.cnpj,
    m.uf,
    m.municipio,
    m.total_vitorias,
    v_total
  FROM mv_empresas_vencedoras m
  WHERE (p_uf IS NULL OR m.uf = p_uf)
    AND (p_search IS NULL OR m.razao_social ILIKE '%' || p_search || '%' OR m.cnpj ILIKE '%' || p_search || '%')
  ORDER BY m.total_vitorias DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Also create materialized view for orgaos
CREATE MATERIALIZED VIEW public.mv_orgaos AS
SELECT
  l.orgao,
  l.uf,
  l.municipio,
  COUNT(*) AS total_licitacoes
FROM licitacoes l
WHERE l.orgao IS NOT NULL
GROUP BY l.orgao, l.uf, l.municipio;

CREATE INDEX idx_mv_orgaos_orgao ON public.mv_orgaos (orgao);
CREATE INDEX idx_mv_orgaos_uf ON public.mv_orgaos (uf);
CREATE INDEX idx_mv_orgaos_licit ON public.mv_orgaos (total_licitacoes DESC);
CREATE INDEX idx_mv_orgaos_orgao_trgm ON public.mv_orgaos USING gin (orgao gin_trgm_ops);

-- Replace orgaos function
CREATE OR REPLACE FUNCTION public.list_orgaos(
  p_search text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_limit int DEFAULT 50,
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
SET statement_timeout = '10s'
SET search_path = public
AS $$
DECLARE
  v_total bigint;
BEGIN
  SELECT count(*) INTO v_total
  FROM mv_orgaos m
  WHERE (p_uf IS NULL OR m.uf = p_uf)
    AND (p_search IS NULL OR m.orgao ILIKE '%' || p_search || '%');

  RETURN QUERY
  SELECT
    m.orgao,
    m.uf,
    m.municipio,
    m.total_licitacoes,
    v_total
  FROM mv_orgaos m
  WHERE (p_uf IS NULL OR m.uf = p_uf)
    AND (p_search IS NULL OR m.orgao ILIKE '%' || p_search || '%')
  ORDER BY m.total_licitacoes DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
