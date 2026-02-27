
-- Drop and recreate with optimized approach
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  -- If vencedor filter is active, use different strategy
  IF p_vencedor IS NOT NULL AND p_vencedor != '' THEN
    -- Count first with vencedor join
    SELECT count(*) INTO v_count
    FROM licitacoes l
    JOIN licitacao_itens li ON li.licitacao_id = l.id
    JOIN licitacao_vencedores lv ON lv.item_id = li.id
    WHERE
      (p_search IS NULL OR l.objeto ILIKE '%' || p_search || '%' OR l.orgao ILIKE '%' || p_search || '%')
      AND (p_modalidade IS NULL OR l.modalidade = p_modalidade)
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_situacao IS NULL OR l.situacao = p_situacao)
      AND (p_orgao IS NULL OR l.orgao ILIKE '%' || p_orgao || '%')
      AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
      AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to)
      AND lv.razao_social ILIKE '%' || p_vencedor || '%';

    RETURN QUERY
    SELECT DISTINCT ON (l.id)
      l.id, l.orgao, l.objeto, l.modalidade, l.valor_estimado,
      l.data_publicacao, l.uf, l.situacao, l.municipio, l.numero_controle_pncp,
      lv.razao_social AS vencedor_nome,
      v_count AS total_count
    FROM licitacoes l
    JOIN licitacao_itens li ON li.licitacao_id = l.id
    JOIN licitacao_vencedores lv ON lv.item_id = li.id
    WHERE
      (p_search IS NULL OR l.objeto ILIKE '%' || p_search || '%' OR l.orgao ILIKE '%' || p_search || '%')
      AND (p_modalidade IS NULL OR l.modalidade = p_modalidade)
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_situacao IS NULL OR l.situacao = p_situacao)
      AND (p_orgao IS NULL OR l.orgao ILIKE '%' || p_orgao || '%')
      AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
      AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to)
      AND lv.razao_social ILIKE '%' || p_vencedor || '%'
    ORDER BY l.id, l.data_publicacao DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;
  ELSE
    -- No vencedor filter: fast path without joining vencedores for count
    SELECT count(*) INTO v_count
    FROM licitacoes l
    WHERE
      (p_search IS NULL OR l.objeto ILIKE '%' || p_search || '%' OR l.orgao ILIKE '%' || p_search || '%')
      AND (p_modalidade IS NULL OR l.modalidade = p_modalidade)
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_situacao IS NULL OR l.situacao = p_situacao)
      AND (p_orgao IS NULL OR l.orgao ILIKE '%' || p_orgao || '%')
      AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
      AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to);

    RETURN QUERY
    SELECT
      l.id, l.orgao, l.objeto, l.modalidade, l.valor_estimado,
      l.data_publicacao, l.uf, l.situacao, l.municipio, l.numero_controle_pncp,
      lv.razao_social AS vencedor_nome,
      v_count AS total_count
    FROM licitacoes l
    LEFT JOIN LATERAL (
      SELECT lv2.razao_social
      FROM licitacao_itens li2
      JOIN licitacao_vencedores lv2 ON lv2.item_id = li2.id
      WHERE li2.licitacao_id = l.id
      LIMIT 1
    ) lv ON true
    WHERE
      (p_search IS NULL OR l.objeto ILIKE '%' || p_search || '%' OR l.orgao ILIKE '%' || p_search || '%')
      AND (p_modalidade IS NULL OR l.modalidade = p_modalidade)
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_situacao IS NULL OR l.situacao = p_situacao)
      AND (p_orgao IS NULL OR l.orgao ILIKE '%' || p_orgao || '%')
      AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
      AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to)
    ORDER BY l.data_publicacao DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$;

-- Add index on data_publicacao for fast ORDER BY
CREATE INDEX IF NOT EXISTS idx_licitacoes_data_pub_desc ON public.licitacoes (data_publicacao DESC NULLS LAST);

-- Add composite index for common filter combo
CREATE INDEX IF NOT EXISTS idx_licitacoes_situacao_data ON public.licitacoes (situacao, data_publicacao DESC NULLS LAST);

-- Add index on licitacao_itens.licitacao_id for fast lateral joins
CREATE INDEX IF NOT EXISTS idx_licitacao_itens_lic_id ON public.licitacao_itens (licitacao_id);
