
-- Recreate mv_orgaos with total_valor
DROP MATERIALIZED VIEW IF EXISTS public.mv_orgaos;
CREATE MATERIALIZED VIEW public.mv_orgaos AS
SELECT
  l.orgao,
  l.uf,
  l.municipio,
  COUNT(*)::int AS total_licitacoes,
  COALESCE(SUM(l.valor_estimado), 0)::numeric AS total_valor
FROM public.licitacoes l
WHERE l.orgao IS NOT NULL
GROUP BY l.orgao, l.uf, l.municipio;

CREATE INDEX idx_mv_orgaos_orgao_trgm ON public.mv_orgaos USING gin (orgao gin_trgm_ops);
CREATE INDEX idx_mv_orgaos_uf ON public.mv_orgaos (uf);

GRANT SELECT ON public.mv_orgaos TO authenticated, anon;

-- Recreate mv_empresas_vencedoras with total_valor
DROP MATERIALIZED VIEW IF EXISTS public.mv_empresas_vencedoras;
CREATE MATERIALIZED VIEW public.mv_empresas_vencedoras AS
SELECT
  v.razao_social,
  v.cnpj,
  l.uf,
  l.municipio,
  COUNT(*)::int AS total_vitorias,
  COALESCE(SUM(v.valor_final), 0)::numeric AS total_valor
FROM public.licitacao_vencedores v
JOIN public.licitacao_itens i ON i.id = v.item_id
JOIN public.licitacoes l ON l.id = i.licitacao_id
WHERE v.razao_social IS NOT NULL
GROUP BY v.razao_social, v.cnpj, l.uf, l.municipio;

CREATE INDEX idx_mv_emp_venc_razao_trgm ON public.mv_empresas_vencedoras USING gin (razao_social gin_trgm_ops);
CREATE INDEX idx_mv_emp_venc_cnpj_trgm ON public.mv_empresas_vencedoras USING gin (cnpj gin_trgm_ops);
CREATE INDEX idx_mv_emp_venc_uf ON public.mv_empresas_vencedoras (uf);

GRANT SELECT ON public.mv_empresas_vencedoras TO authenticated, anon;

-- Recreate list_orgaos with total_valor and sorting
CREATE OR REPLACE FUNCTION public.list_orgaos(
  p_search text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_order_by text DEFAULT 'total_licitacoes'
)
RETURNS TABLE(orgao text, uf text, municipio text, total_licitacoes int, total_valor numeric, total_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT m.orgao, m.uf, m.municipio, m.total_licitacoes, m.total_valor
    FROM mv_orgaos m
    WHERE (p_search IS NULL OR m.orgao % p_search OR m.orgao ILIKE '%' || p_search || '%')
      AND (p_uf IS NULL OR m.uf = p_uf)
  )
  SELECT f.orgao, f.uf, f.municipio, f.total_licitacoes, f.total_valor,
         (SELECT COUNT(*) FROM filtered)::bigint AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN p_order_by = 'total_valor' THEN f.total_valor END DESC NULLS LAST,
    CASE WHEN p_order_by != 'total_valor' THEN f.total_licitacoes END DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$$;

-- Recreate list_empresas_vencedoras with total_valor and sorting
CREATE OR REPLACE FUNCTION public.list_empresas_vencedoras(
  p_search text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_order_by text DEFAULT 'total_vitorias'
)
RETURNS TABLE(razao_social text, cnpj text, uf text, municipio text, total_vitorias int, total_valor numeric, total_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT m.razao_social, m.cnpj, m.uf, m.municipio, m.total_vitorias, m.total_valor
    FROM mv_empresas_vencedoras m
    WHERE (p_search IS NULL OR m.razao_social % p_search OR m.razao_social ILIKE '%' || p_search || '%'
           OR m.cnpj ILIKE '%' || p_search || '%')
      AND (p_uf IS NULL OR m.uf = p_uf)
  )
  SELECT f.razao_social, f.cnpj, f.uf, f.municipio, f.total_vitorias, f.total_valor,
         (SELECT COUNT(*) FROM filtered)::bigint AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN p_order_by = 'total_valor' THEN f.total_valor END DESC NULLS LAST,
    CASE WHEN p_order_by != 'total_valor' THEN f.total_vitorias END DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$$;
