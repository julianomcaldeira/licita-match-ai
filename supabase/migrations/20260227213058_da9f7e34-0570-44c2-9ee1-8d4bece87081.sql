
-- Add trigram index on objeto for fast text search
CREATE INDEX IF NOT EXISTS idx_licitacoes_objeto_trgm 
ON public.licitacoes USING gin (objeto gin_trgm_ops);

-- Optimized search_licitacoes: single-pass CTE with window count
CREATE OR REPLACE FUNCTION public.search_licitacoes(
  p_search text DEFAULT NULL,
  p_modalidade text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_situacao text DEFAULT NULL,
  p_orgao text DEFAULT NULL,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_com_vencedor boolean DEFAULT false,
  p_vencedor text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, orgao text, objeto text, modalidade text,
  valor_estimado numeric, valor_homologado numeric,
  data_publicacao text, uf text, situacao text, municipio text,
  numero_controle_pncp text, vencedor_nome text, total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT DISTINCT ON (l.id)
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
      l.numero_controle_pncp,
      lv.razao_social AS vencedor_nome
    FROM licitacoes l
    LEFT JOIN licitacao_itens li ON li.licitacao_id = l.id
    LEFT JOIN licitacao_vencedores lv ON lv.item_id = li.id
    WHERE
      (p_search IS NULL OR l.objeto ILIKE '%' || p_search || '%')
      AND (p_modalidade IS NULL OR l.modalidade ILIKE '%' || p_modalidade || '%')
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_situacao IS NULL OR l.situacao ILIKE '%' || p_situacao || '%')
      AND (p_orgao IS NULL OR l.orgao % p_orgao)
      AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from::date)
      AND (p_date_to IS NULL OR l.data_publicacao <= p_date_to::date)
      AND (NOT p_com_vencedor OR lv.id IS NOT NULL)
      AND (p_vencedor IS NULL OR lv.razao_social ILIKE '%' || p_vencedor || '%')
    ORDER BY l.id, lv.razao_social
  ),
  counted AS (
    SELECT *, count(*) OVER() AS cnt
    FROM filtered
    ORDER BY valor_homologado DESC NULLS LAST, valor_estimado DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    counted.id, counted.orgao, counted.objeto, counted.modalidade,
    counted.valor_estimado, counted.valor_homologado,
    counted.data_publicacao, counted.uf, counted.situacao,
    counted.municipio, counted.numero_controle_pncp,
    counted.vencedor_nome, counted.cnt AS total_count
  FROM counted;
END;
$function$;
