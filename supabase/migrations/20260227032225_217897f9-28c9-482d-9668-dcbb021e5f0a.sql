
CREATE OR REPLACE FUNCTION public.search_licitacoes(
  p_search text DEFAULT NULL,
  p_modalidade text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_situacao text DEFAULT NULL,
  p_orgao text DEFAULT NULL,
  p_vencedor text DEFAULT NULL,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_com_vencedor boolean DEFAULT false
)
RETURNS TABLE(
  id uuid, orgao text, objeto text, modalidade text, valor_estimado numeric,
  data_publicacao text, uf text, situacao text, municipio text,
  numero_controle_pncp text, vencedor_nome text, total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count BIGINT;
  has_filters BOOLEAN;
BEGIN
  has_filters := (p_search IS NOT NULL OR p_modalidade IS NOT NULL OR p_uf IS NOT NULL
    OR p_situacao IS NOT NULL OR p_orgao IS NOT NULL OR p_vencedor IS NOT NULL
    OR p_date_from IS NOT NULL OR p_date_to IS NOT NULL OR p_com_vencedor = TRUE);

  IF p_vencedor IS NOT NULL OR p_com_vencedor = TRUE THEN
    SELECT count(DISTINCT l.id) INTO v_count
    FROM licitacoes l
    JOIN licitacao_itens li ON li.licitacao_id = l.id
    JOIN licitacao_vencedores lv ON lv.item_id = li.id
    WHERE (p_search IS NULL OR l.objeto ILIKE '%' || p_search || '%')
      AND (p_modalidade IS NULL OR l.modalidade = p_modalidade)
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_situacao IS NULL OR l.situacao = p_situacao)
      AND (p_orgao IS NULL OR l.orgao ILIKE '%' || p_orgao || '%')
      AND (p_vencedor IS NULL OR lv.razao_social ILIKE '%' || p_vencedor || '%')
      AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from::date)
      AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to::date);

    RETURN QUERY
    SELECT DISTINCT ON (l.id) l.id, l.orgao, l.objeto, l.modalidade, l.valor_estimado,
      l.data_publicacao::text, l.uf, l.situacao, l.municipio, l.numero_controle_pncp,
      lv.razao_social AS vencedor_nome,
      v_count AS total_count
    FROM licitacoes l
    JOIN licitacao_itens li ON li.licitacao_id = l.id
    JOIN licitacao_vencedores lv ON lv.item_id = li.id
    WHERE (p_search IS NULL OR l.objeto ILIKE '%' || p_search || '%')
      AND (p_modalidade IS NULL OR l.modalidade = p_modalidade)
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_situacao IS NULL OR l.situacao = p_situacao)
      AND (p_orgao IS NULL OR l.orgao ILIKE '%' || p_orgao || '%')
      AND (p_vencedor IS NULL OR lv.razao_social ILIKE '%' || p_vencedor || '%')
      AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from::date)
      AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to::date)
    ORDER BY l.id, l.valor_estimado DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;

  ELSE
    IF NOT has_filters THEN
      SELECT reltuples::BIGINT INTO v_count FROM pg_class WHERE relname = 'licitacoes';
    ELSE
      SELECT count(*) INTO v_count FROM licitacoes l
      WHERE (p_search IS NULL OR l.objeto ILIKE '%' || p_search || '%')
        AND (p_modalidade IS NULL OR l.modalidade = p_modalidade)
        AND (p_uf IS NULL OR l.uf = p_uf)
        AND (p_situacao IS NULL OR l.situacao = p_situacao)
        AND (p_orgao IS NULL OR l.orgao ILIKE '%' || p_orgao || '%')
        AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from::date)
        AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to::date);
    END IF;

    RETURN QUERY
    SELECT l.id, l.orgao, l.objeto, l.modalidade, l.valor_estimado,
      l.data_publicacao::text, l.uf, l.situacao, l.municipio, l.numero_controle_pncp,
      lv.razao_social AS vencedor_nome,
      v_count AS total_count
    FROM licitacoes l
    LEFT JOIN LATERAL (
      SELECT lv2.razao_social FROM licitacao_itens li2
      JOIN licitacao_vencedores lv2 ON lv2.item_id = li2.id
      WHERE li2.licitacao_id = l.id LIMIT 1
    ) lv ON true
    WHERE (p_search IS NULL OR l.objeto ILIKE '%' || p_search || '%')
      AND (p_modalidade IS NULL OR l.modalidade = p_modalidade)
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_situacao IS NULL OR l.situacao = p_situacao)
      AND (p_orgao IS NULL OR l.orgao ILIKE '%' || p_orgao || '%')
      AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from::date)
      AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to::date)
    ORDER BY l.valor_estimado DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$function$;
