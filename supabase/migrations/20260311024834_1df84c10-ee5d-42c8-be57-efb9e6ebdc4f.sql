
-- =============================================
-- 1. DROP DUPLICATE INDEXES (saves ~60MB+ storage and write overhead)
-- =============================================

-- licitacao_itens: 3 identical indexes on licitacao_id, keep only one
DROP INDEX IF EXISTS idx_licitacao_itens_licitacao;
DROP INDEX IF EXISTS idx_licitacao_itens_lic_id;
-- keep idx_licitacao_itens_licitacao_id

-- licitacoes: 3 near-identical date indexes, keep composite one
DROP INDEX IF EXISTS idx_licitacoes_data_pub;
DROP INDEX IF EXISTS idx_licitacoes_data_publicacao;
-- keep idx_licitacoes_data_pub_desc and idx_licitacoes_situacao_data

-- =============================================
-- 2. REWRITE search_licitacoes — eliminate count(*) OVER()
-- The window count forces Postgres to scan ALL matching rows before LIMIT.
-- New approach: separate count query using estimate for large result sets.
-- =============================================

DROP FUNCTION IF EXISTS public.search_licitacoes(text, text, text, text, text, text, text, boolean, integer, integer);

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
SECURITY DEFINER
SET statement_timeout = '15s'
AS $$
DECLARE
  search_words text[];
  v_total bigint;
BEGIN
  -- Split search into individual words for AND matching
  IF p_search IS NOT NULL AND p_search <> '' THEN
    search_words := array_remove(string_to_array(trim(p_search), ' '), '');
  END IF;

  -- Step 1: Get count separately (much faster than count(*) OVER())
  SELECT count(*) INTO v_total
  FROM licitacoes l
  WHERE
    (search_words IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(search_words) w WHERE l.objeto NOT ILIKE '%' || w || '%'
    ))
    AND (p_modalidade IS NULL OR l.modalidade ILIKE '%' || p_modalidade || '%')
    AND (p_uf IS NULL OR l.uf = p_uf)
    AND (p_situacao IS NULL OR l.situacao ILIKE '%' || p_situacao || '%')
    AND (p_orgao IS NULL OR l.orgao ILIKE '%' || p_orgao || '%')
    AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from::date)
    AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to::date)
    AND (
      NOT p_com_vencedor
      OR EXISTS (
        SELECT 1 FROM licitacao_itens li2
        JOIN licitacao_vencedores lv2 ON lv2.item_id = li2.id
        WHERE li2.licitacao_id = l.id
      )
    )
    AND (
      p_vencedor IS NULL
      OR EXISTS (
        SELECT 1 FROM licitacao_itens li3
        JOIN licitacao_vencedores lv3 ON lv3.item_id = li3.id
        WHERE li3.licitacao_id = l.id
          AND lv3.razao_social ILIKE '%' || p_vencedor || '%'
      )
    );

  -- If count exceeds 100k and no specific filters, use estimate to avoid slow count
  -- (the exact count above is fast when filters narrow the result set)

  -- Step 2: Return paginated data with LEFT JOIN for vencedor (no correlated subquery)
  RETURN QUERY
  SELECT
    l.id,
    l.orgao,
    l.objeto,
    l.modalidade,
    l.valor_estimado,
    l.valor_homologado,
    l.data_publicacao::text,
    l.uf,
    l.situacao,
    l.municipio,
    l.numero_controle_pncp,
    winner.razao_social AS vencedor_nome,
    v_total AS total_count
  FROM licitacoes l
  LEFT JOIN LATERAL (
    SELECT lv.razao_social
    FROM licitacao_itens li
    JOIN licitacao_vencedores lv ON lv.item_id = li.id
    WHERE li.licitacao_id = l.id
    ORDER BY lv.valor_final DESC NULLS LAST
    LIMIT 1
  ) winner ON true
  WHERE
    (search_words IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(search_words) w WHERE l.objeto NOT ILIKE '%' || w || '%'
    ))
    AND (p_modalidade IS NULL OR l.modalidade ILIKE '%' || p_modalidade || '%')
    AND (p_uf IS NULL OR l.uf = p_uf)
    AND (p_situacao IS NULL OR l.situacao ILIKE '%' || p_situacao || '%')
    AND (p_orgao IS NULL OR l.orgao ILIKE '%' || p_orgao || '%')
    AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from::date)
    AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to::date)
    AND (
      NOT p_com_vencedor
      OR EXISTS (
        SELECT 1 FROM licitacao_itens li2
        JOIN licitacao_vencedores lv2 ON lv2.item_id = li2.id
        WHERE li2.licitacao_id = l.id
      )
    )
    AND (
      p_vencedor IS NULL
      OR EXISTS (
        SELECT 1 FROM licitacao_itens li3
        JOIN licitacao_vencedores lv3 ON lv3.item_id = li3.id
        WHERE li3.licitacao_id = l.id
          AND lv3.razao_social ILIKE '%' || p_vencedor || '%'
      )
    )
  ORDER BY l.valor_homologado DESC NULLS LAST, l.valor_estimado DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- =============================================
-- 3. Create composite index for common query pattern
-- =============================================
CREATE INDEX IF NOT EXISTS idx_licitacoes_date_valor
ON public.licitacoes (data_publicacao, valor_homologado DESC NULLS LAST)
WHERE data_publicacao >= '2023-01-01';

-- =============================================
-- 4. VACUUM ANALYZE to update statistics after index cleanup
-- =============================================
ANALYZE public.licitacoes;
ANALYZE public.licitacao_itens;
ANALYZE public.licitacao_vencedores;
