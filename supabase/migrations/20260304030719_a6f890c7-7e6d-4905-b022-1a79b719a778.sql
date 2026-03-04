
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
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
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
LANGUAGE plpgsql STABLE
SET statement_timeout = '15s'
SET search_path = public
AS $$
DECLARE
  search_words text[];
BEGIN
  -- Split search into individual words for AND matching
  IF p_search IS NOT NULL AND p_search <> '' THEN
    search_words := string_to_array(trim(p_search), ' ');
    -- Remove empty strings
    search_words := array_remove(search_words, '');
  END IF;

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
      -- Text search: each word must appear in objeto (AND logic)
      (search_words IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(search_words) w
        WHERE l.objeto NOT ILIKE '%' || w || '%'
      ))
      AND (p_modalidade IS NULL OR l.modalidade ILIKE '%' || p_modalidade || '%')
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_situacao IS NULL OR l.situacao ILIKE '%' || p_situacao || '%')
      AND (p_orgao IS NULL OR l.orgao % p_orgao)
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
