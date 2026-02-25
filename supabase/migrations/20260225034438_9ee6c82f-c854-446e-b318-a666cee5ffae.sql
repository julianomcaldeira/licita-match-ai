
-- Function to match licitações by empresa keywords (palavras_chave + segmentos)
-- Returns licitações whose objeto contains at least one keyword from the empresa
CREATE OR REPLACE FUNCTION public.match_licitacoes_por_keywords(
  p_empresa_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  licitacao_id UUID,
  objeto TEXT,
  orgao TEXT,
  modalidade TEXT,
  valor_estimado NUMERIC,
  situacao TEXT,
  uf TEXT,
  keywords_matched TEXT[],
  match_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keywords TEXT[];
  v_segmentos TEXT[];
  v_all_terms TEXT[];
BEGIN
  -- Get empresa keywords and segmentos
  SELECT 
    COALESCE(e.palavras_chave, ARRAY[]::TEXT[]),
    COALESCE(e.segmentos, ARRAY[]::TEXT[])
  INTO v_keywords, v_segmentos
  FROM empresas_clientes e
  WHERE e.id = p_empresa_id;

  -- Combine all search terms
  v_all_terms := v_keywords || v_segmentos;

  -- If no terms configured, return empty
  IF array_length(v_all_terms, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH matched AS (
    SELECT 
      l.id AS lid,
      l.objeto AS lobjeto,
      l.orgao AS lorgao,
      l.modalidade AS lmodalidade,
      l.valor_estimado AS lvalor,
      l.situacao AS lsituacao,
      l.uf AS luf,
      ARRAY_AGG(term) FILTER (WHERE LOWER(l.objeto) LIKE '%' || LOWER(term) || '%') AS matched_keywords
    FROM licitacoes l
    CROSS JOIN UNNEST(v_all_terms) AS term
    -- Exclude already analyzed for this empresa
    WHERE NOT EXISTS (
      SELECT 1 FROM oportunidades o 
      WHERE o.licitacao_id = l.id AND o.empresa_id = p_empresa_id
    )
    GROUP BY l.id, l.objeto, l.orgao, l.modalidade, l.valor_estimado, l.situacao, l.uf
  )
  SELECT 
    m.lid,
    m.lobjeto,
    m.lorgao,
    m.lmodalidade,
    m.lvalor,
    m.lsituacao,
    m.luf,
    m.matched_keywords,
    COALESCE(array_length(m.matched_keywords, 1), 0)
  FROM matched m
  WHERE m.matched_keywords IS NOT NULL 
    AND array_length(m.matched_keywords, 1) > 0
  ORDER BY array_length(m.matched_keywords, 1) DESC, m.lvalor DESC NULLS LAST
  LIMIT p_limit;
END;
$$;
