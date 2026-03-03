
-- Rewrite search_licitacoes to eliminate cartesian product from JOINs
-- Strategy: filter on licitacoes only, use EXISTS for vencedor/vencedor_name checks,
-- and only fetch winner name for the final paginated rows
CREATE OR REPLACE FUNCTION public.search_licitacoes(
  p_search text DEFAULT NULL,
  p_modalidade text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_situacao text DEFAULT NULL,
  p_orgao text DEFAULT NULL,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL,
  p_com_vencedor boolean DEFAULT false,
  p_vencedor text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  orgao text,
  objeto text,
  modalidade text,
  valor_estimado numeric,
  valor_homologado numeric,
  data_publicacao text,
  uf text,
  situacao text,
  municipio text,
  numero_controle_pncp text,
  vencedor_nome text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SET statement_timeout = '15s'
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      l.id,
      l.orgao,
      l.objeto,
      l.modalidade,
      l.valor_estimado,
      l.valor_homologado,
      l.data_publicacao::text AS data_publicacao,
      l.uf,
      l.situacao,
      l.municipio,
      l.numero_controle_pncp
    FROM licitacoes l
    WHERE
      -- Text search on objeto (uses trigram GIN index)
      (p_search IS NULL OR l.objeto ILIKE '%' || p_search || '%')
      -- Modalidade filter
      AND (p_modalidade IS NULL OR l.modalidade ILIKE '%' || p_modalidade || '%')
      -- UF exact match
      AND (p_uf IS NULL OR l.uf = p_uf)
      -- Situacao filter
      AND (p_situacao IS NULL OR l.situacao ILIKE '%' || p_situacao || '%')
      -- Orgao trigram similarity
      AND (p_orgao IS NULL OR l.orgao % p_orgao)
      -- Date range
      AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from::date)
      AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to::date)
      -- Has winner: use EXISTS subquery instead of JOIN
      AND (
        NOT p_com_vencedor
        OR EXISTS (
          SELECT 1 FROM licitacao_itens li2
          JOIN licitacao_vencedores lv2 ON lv2.item_id = li2.id
          WHERE li2.licitacao_id = l.id
        )
      )
      -- Winner name filter: use EXISTS subquery
      AND (
        p_vencedor IS NULL
        OR EXISTS (
          SELECT 1 FROM licitacao_itens li3
          JOIN licitacao_vencedores lv3 ON lv3.item_id = li3.id
          WHERE li3.licitacao_id = l.id
            AND lv3.razao_social ILIKE '%' || p_vencedor || '%'
        )
      )
  ),
  counted AS (
    SELECT *, count(*) OVER() AS cnt
    FROM base
    ORDER BY base.valor_homologado DESC NULLS LAST, base.valor_estimado DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    counted.id,
    counted.orgao,
    counted.objeto,
    counted.modalidade,
    counted.valor_estimado,
    counted.valor_homologado,
    counted.data_publicacao,
    counted.uf,
    counted.situacao,
    counted.municipio,
    counted.numero_controle_pncp,
    -- Only fetch winner name for the final paginated rows (max 20)
    (
      SELECT lv.razao_social
      FROM licitacao_itens li
      JOIN licitacao_vencedores lv ON lv.item_id = li.id
      WHERE li.licitacao_id = counted.id
      ORDER BY lv.valor_final DESC NULLS LAST
      LIMIT 1
    ) AS vencedor_nome,
    counted.cnt AS total_count
  FROM counted;
END;
$$;

-- Ensure we have the right indexes for the subqueries
CREATE INDEX IF NOT EXISTS idx_licitacao_itens_licitacao_id ON licitacao_itens(licitacao_id);
CREATE INDEX IF NOT EXISTS idx_licitacao_vencedores_item_id ON licitacao_vencedores(item_id);
CREATE INDEX IF NOT EXISTS idx_licitacoes_data_pub ON licitacoes(data_publicacao);
CREATE INDEX IF NOT EXISTS idx_licitacoes_uf ON licitacoes(uf);
CREATE INDEX IF NOT EXISTS idx_licitacoes_modalidade ON licitacoes USING gin (modalidade gin_trgm_ops);
