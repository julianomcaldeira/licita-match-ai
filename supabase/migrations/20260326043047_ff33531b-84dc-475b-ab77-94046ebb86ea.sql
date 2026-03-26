
DROP FUNCTION IF EXISTS public.search_licitacoes(text, text, text, text, text, text, text, boolean, text, integer, integer);

CREATE FUNCTION public.search_licitacoes(
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
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '25s'
AS $function$
DECLARE
  search_words text[];
  has_search boolean := false;
BEGIN
  IF p_search IS NOT NULL AND trim(p_search) <> '' THEN
    search_words := array_remove(string_to_array(lower(trim(p_search)), ' '), '');
    has_search := array_length(search_words, 1) > 0;
  END IF;

  IF p_vencedor IS NOT NULL AND trim(p_vencedor) <> '' THEN
    RETURN QUERY
    WITH matched_lics AS (
      SELECT DISTINCT li3.licitacao_id
      FROM licitacao_itens li3
      JOIN licitacao_vencedores lv3 ON lv3.item_id = li3.id
      WHERE lv3.razao_social ILIKE '%' || p_vencedor || '%'
    ),
    filtered AS (
      SELECT l.* FROM licitacoes l
      JOIN matched_lics ml ON ml.licitacao_id = l.id
      WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from::date)
        AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to::date)
        AND (p_modalidade IS NULL OR l.modalidade ILIKE '%' || p_modalidade || '%')
        AND (p_uf IS NULL OR l.uf = p_uf)
        AND (p_situacao IS NULL OR l.situacao ILIKE '%' || p_situacao || '%')
        AND (p_orgao IS NULL OR l.orgao ILIKE '%' || p_orgao || '%')
        AND (NOT COALESCE(p_com_vencedor, false) OR l.valor_homologado > 0)
        AND (NOT has_search OR l.objeto ILIKE '%' || search_words[1] || '%')
      ORDER BY l.valor_homologado DESC NULLS LAST, l.valor_estimado DESC NULLS LAST
      LIMIT p_limit OFFSET p_offset
    )
    SELECT f.id, f.orgao, f.objeto, f.modalidade, f.valor_estimado, f.valor_homologado,
           f.data_publicacao::text, f.uf, f.situacao, f.municipio, f.numero_controle_pncp,
           (SELECT lv.razao_social FROM licitacao_itens li JOIN licitacao_vencedores lv ON lv.item_id = li.id
            WHERE li.licitacao_id = f.id ORDER BY lv.valor_final DESC NULLS LAST LIMIT 1),
           NULL::bigint
    FROM filtered f;
    RETURN;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT l.* FROM licitacoes l
    WHERE (p_date_from IS NULL OR l.data_publicacao >= p_date_from::date)
      AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to::date)
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_situacao IS NULL OR l.situacao ILIKE '%' || p_situacao || '%')
      AND (p_modalidade IS NULL OR l.modalidade ILIKE '%' || p_modalidade || '%')
      AND (p_orgao IS NULL OR l.orgao ILIKE '%' || p_orgao || '%')
      AND (NOT COALESCE(p_com_vencedor, false) OR l.valor_homologado > 0)
      AND (
        NOT has_search
        OR l.objeto ILIKE '%' || search_words[1] || '%'
        OR EXISTS (
          SELECT 1 FROM licitacao_itens li_s
          WHERE li_s.licitacao_id = l.id
            AND li_s.descricao ILIKE '%' || search_words[1] || '%'
        )
      )
    ORDER BY l.valor_homologado DESC NULLS LAST, l.valor_estimado DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset
  )
  SELECT f.id, f.orgao, f.objeto, f.modalidade, f.valor_estimado, f.valor_homologado,
         f.data_publicacao::text, f.uf, f.situacao, f.municipio, f.numero_controle_pncp,
         (SELECT lv.razao_social FROM licitacao_itens li JOIN licitacao_vencedores lv ON lv.item_id = li.id
          WHERE li.licitacao_id = f.id ORDER BY lv.valor_final DESC NULLS LAST LIMIT 1),
         NULL::bigint
  FROM filtered f;
END;
$function$;
