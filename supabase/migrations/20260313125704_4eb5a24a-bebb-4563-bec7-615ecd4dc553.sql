
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
  id uuid, orgao text, objeto text, modalidade text,
  valor_estimado numeric, valor_homologado numeric,
  data_publicacao text, uf text, situacao text,
  municipio text, numero_controle_pncp text,
  vencedor_nome text, total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET statement_timeout TO '15s'
AS $function$
DECLARE
  search_words text[];
  v_total bigint;
BEGIN
  IF p_search IS NOT NULL AND p_search <> '' THEN
    search_words := array_remove(string_to_array(trim(p_search), ' '), '');
  END IF;

  SELECT count(*) INTO v_total
  FROM licitacoes l
  WHERE
    (search_words IS NULL OR (
      NOT EXISTS (
        SELECT 1 FROM unnest(search_words) w WHERE l.objeto NOT ILIKE '%' || w || '%'
      )
      OR EXISTS (
        SELECT 1 FROM licitacao_itens li_s
        WHERE li_s.licitacao_id = l.id
        AND NOT EXISTS (
          SELECT 1 FROM unnest(search_words) w WHERE li_s.descricao NOT ILIKE '%' || w || '%'
        )
      )
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

  RETURN QUERY
  SELECT
    l.id, l.orgao, l.objeto, l.modalidade,
    l.valor_estimado, l.valor_homologado,
    l.data_publicacao::text, l.uf, l.situacao,
    l.municipio, l.numero_controle_pncp,
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
    (search_words IS NULL OR (
      NOT EXISTS (
        SELECT 1 FROM unnest(search_words) w WHERE l.objeto NOT ILIKE '%' || w || '%'
      )
      OR EXISTS (
        SELECT 1 FROM licitacao_itens li_s
        WHERE li_s.licitacao_id = l.id
        AND NOT EXISTS (
          SELECT 1 FROM unnest(search_words) w WHERE li_s.descricao NOT ILIKE '%' || w || '%'
        )
      )
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
$function$;
