
-- List all distinct órgãos with UF and município, with count of licitações
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
LANGUAGE sql STABLE
SET statement_timeout = '15s'
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT
      l.orgao,
      COALESCE(l.uf, 'N/I') AS uf,
      COALESCE(l.municipio, 'N/I') AS municipio,
      count(*) AS total_licitacoes
    FROM licitacoes l
    WHERE (p_search IS NULL OR l.orgao ILIKE '%' || p_search || '%')
      AND (p_uf IS NULL OR l.uf = p_uf)
    GROUP BY l.orgao, l.uf, l.municipio
  ),
  cnt AS (SELECT count(*) AS total_count FROM filtered)
  SELECT f.orgao, f.uf, f.municipio, f.total_licitacoes, c.total_count
  FROM filtered f, cnt c
  ORDER BY f.total_licitacoes DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- List all distinct empresas (vencedores) with location from licitação
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
LANGUAGE sql STABLE
SET statement_timeout = '15s'
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT
      COALESCE(v.razao_social, 'Não informado') AS razao_social,
      COALESCE(v.cnpj, 'N/I') AS cnpj,
      COALESCE(l.uf, 'N/I') AS uf,
      COALESCE(l.municipio, 'N/I') AS municipio,
      count(*) AS total_vitorias
    FROM licitacao_vencedores v
    JOIN licitacao_itens i ON i.id = v.item_id
    JOIN licitacoes l ON l.id = i.licitacao_id
    WHERE (p_search IS NULL OR v.razao_social ILIKE '%' || p_search || '%' OR v.cnpj ILIKE '%' || p_search || '%')
      AND (p_uf IS NULL OR l.uf = p_uf)
    GROUP BY v.razao_social, v.cnpj, l.uf, l.municipio
  ),
  cnt AS (SELECT count(*) AS total_count FROM filtered)
  SELECT f.razao_social, f.cnpj, f.uf, f.municipio, f.total_vitorias, c.total_count
  FROM filtered f, cnt c
  ORDER BY f.total_vitorias DESC
  LIMIT p_limit OFFSET p_offset;
$$;
