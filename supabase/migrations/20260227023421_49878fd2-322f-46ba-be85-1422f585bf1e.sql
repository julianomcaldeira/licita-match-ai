
-- Enable pg_trgm extension first
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_licitacoes_situacao ON public.licitacoes (situacao);
CREATE INDEX IF NOT EXISTS idx_licitacoes_orgao_trgm ON public.licitacoes USING gin (orgao gin_trgm_ops);

-- Optimized search RPC with all filters server-side
CREATE OR REPLACE FUNCTION public.search_licitacoes(
  p_search TEXT DEFAULT NULL,
  p_modalidade TEXT DEFAULT NULL,
  p_uf TEXT DEFAULT NULL,
  p_situacao TEXT DEFAULT NULL,
  p_orgao TEXT DEFAULT NULL,
  p_vencedor TEXT DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  orgao TEXT,
  objeto TEXT,
  modalidade TEXT,
  valor_estimado NUMERIC,
  data_publicacao DATE,
  uf TEXT,
  situacao TEXT,
  municipio TEXT,
  numero_controle_pncp TEXT,
  vencedor_nome TEXT,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT
      l.id,
      l.orgao,
      l.objeto,
      l.modalidade,
      l.valor_estimado,
      l.data_publicacao,
      l.uf,
      l.situacao,
      l.municipio,
      l.numero_controle_pncp,
      (
        SELECT lv.razao_social
        FROM licitacao_itens li
        JOIN licitacao_vencedores lv ON lv.item_id = li.id
        WHERE li.licitacao_id = l.id
        LIMIT 1
      ) AS vencedor_nome
    FROM licitacoes l
    WHERE
      (p_search IS NULL OR l.objeto ILIKE '%' || p_search || '%' OR l.orgao ILIKE '%' || p_search || '%')
      AND (p_modalidade IS NULL OR l.modalidade = p_modalidade)
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_situacao IS NULL OR l.situacao ILIKE '%' || p_situacao || '%')
      AND (p_orgao IS NULL OR l.orgao ILIKE '%' || p_orgao || '%')
      AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
      AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to)
  ),
  with_vencedor_filter AS (
    SELECT * FROM filtered
    WHERE (p_vencedor IS NULL OR vencedor_nome ILIKE '%' || p_vencedor || '%')
  ),
  counted AS (
    SELECT count(*) AS cnt FROM with_vencedor_filter
  )
  SELECT
    f.id, f.orgao, f.objeto, f.modalidade, f.valor_estimado,
    f.data_publicacao, f.uf, f.situacao, f.municipio, f.numero_controle_pncp,
    f.vencedor_nome,
    c.cnt AS total_count
  FROM with_vencedor_filter f, counted c
  ORDER BY f.data_publicacao DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$$;

-- Get distinct situacoes for filter dropdown
CREATE OR REPLACE FUNCTION public.get_distinct_situacoes()
RETURNS TABLE (situacao TEXT, count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT situacao, count(*) as count
  FROM licitacoes
  WHERE situacao IS NOT NULL AND situacao != ''
  GROUP BY situacao
  ORDER BY count DESC
  LIMIT 30;
$$;
