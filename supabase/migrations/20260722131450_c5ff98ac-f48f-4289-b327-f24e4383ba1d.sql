
CREATE OR REPLACE FUNCTION public.search_licitacoes(
  p_search text DEFAULT NULL,
  p_orgao text DEFAULT NULL,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_situacao text DEFAULT NULL,
  p_modalidade text DEFAULT NULL,
  p_com_vencedor boolean DEFAULT false,
  p_sem_resultado boolean DEFAULT false,
  p_limit integer DEFAULT 21,
  p_offset integer DEFAULT 0,
  p_vencedor text DEFAULT NULL,
  p_itens text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, orgao text, objeto text, modalidade text,
  valor_estimado numeric, valor_homologado numeric,
  data_publicacao text, uf text, situacao text, municipio text,
  numero_controle_pncp text, vencedor_nome text, total_count bigint
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
SET statement_timeout TO '20s'
AS $function$
DECLARE
  first_word text;
  vencedor_arr text[];
  itens_words text[];
  itens_first text;
BEGIN
  IF p_search IS NOT NULL AND trim(p_search) <> '' THEN
    first_word := (string_to_array(lower(trim(p_search)), ' '))[1];
  END IF;

  IF p_vencedor IS NOT NULL AND trim(p_vencedor) <> '' THEN
    vencedor_arr := string_to_array(p_vencedor, '||');
  END IF;

  IF p_itens IS NOT NULL AND trim(p_itens) <> '' THEN
    itens_words := ARRAY(
      SELECT w FROM unnest(string_to_array(lower(trim(p_itens)), ' ')) AS w
      WHERE length(w) >= 2
    );
    IF array_length(itens_words, 1) > 0 THEN
      itens_first := itens_words[1];
    END IF;
  END IF;

  IF vencedor_arr IS NOT NULL AND array_length(vencedor_arr, 1) > 0 THEN
    RETURN QUERY
    WITH winner_lics AS (
      SELECT DISTINCT li.licitacao_id
      FROM licitacao_itens li
      JOIN licitacao_vencedores lv ON lv.item_id = li.id
      WHERE EXISTS (
        SELECT 1 FROM unnest(vencedor_arr) AS v(name)
        WHERE lv.razao_social ILIKE '%' || trim(v.name) || '%'
      )
    )
    SELECT l.id, l.orgao, l.objeto, l.modalidade, l.valor_estimado, l.valor_homologado,
      l.data_publicacao::text, l.uf, l.situacao, l.municipio, l.numero_controle_pncp,
      NULL::text, NULL::bigint
    FROM licitacoes l JOIN winner_lics wl ON wl.licitacao_id = l.id
    WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from::date)
      AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to::date)
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_situacao IS NULL OR l.situacao ILIKE '%' || p_situacao || '%')
      AND (p_orgao IS NULL OR l.orgao ILIKE '%' || p_orgao || '%')
      AND (NOT COALESCE(p_com_vencedor, false) OR l.valor_homologado > 0)
      AND (NOT COALESCE(p_sem_resultado, false) OR (COALESCE(l.valor_homologado, 0) = 0 AND l.situacao NOT IN ('Revogada', 'Anulada')))
      AND (first_word IS NULL OR l.objeto ILIKE '%' || first_word || '%')
      AND (
        itens_first IS NULL OR EXISTS (
          SELECT 1 FROM licitacao_itens li2
          WHERE li2.licitacao_id = l.id
            AND li2.descricao ILIKE '%' || itens_first || '%'
            AND (
              array_length(itens_words, 1) < 2 OR NOT EXISTS (
                SELECT 1 FROM unnest(itens_words[2:]) AS w(word)
                WHERE li2.descricao NOT ILIKE '%' || w.word || '%'
              )
            )
        )
      )
    ORDER BY l.valor_homologado DESC NULLS LAST, l.valor_estimado DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT l.id, l.orgao, l.objeto, l.modalidade, l.valor_estimado, l.valor_homologado,
    l.data_publicacao::text, l.uf, l.situacao, l.municipio, l.numero_controle_pncp,
    NULL::text, NULL::bigint
  FROM licitacoes l
  WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from::date)
    AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to::date)
    AND (p_uf IS NULL OR l.uf = p_uf)
    AND (p_situacao IS NULL OR l.situacao ILIKE '%' || p_situacao || '%')
    AND (p_modalidade IS NULL OR l.modalidade ILIKE '%' || p_modalidade || '%')
    AND (p_orgao IS NULL OR l.orgao ILIKE '%' || p_orgao || '%')
    AND (NOT COALESCE(p_com_vencedor, false) OR l.valor_homologado > 0)
    AND (NOT COALESCE(p_sem_resultado, false) OR (COALESCE(l.valor_homologado, 0) = 0 AND l.situacao NOT IN ('Revogada', 'Anulada')))
    AND (first_word IS NULL OR l.objeto ILIKE '%' || first_word || '%')
    AND (
      itens_first IS NULL OR EXISTS (
        SELECT 1 FROM licitacao_itens li2
        WHERE li2.licitacao_id = l.id
          AND li2.descricao ILIKE '%' || itens_first || '%'
          AND (
            array_length(itens_words, 1) < 2 OR NOT EXISTS (
              SELECT 1 FROM unnest(itens_words[2:]) AS w(word)
              WHERE li2.descricao NOT ILIKE '%' || w.word || '%'
            )
          )
      )
    )
  ORDER BY l.valor_homologado DESC NULLS LAST, l.valor_estimado DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END;
$function$;
