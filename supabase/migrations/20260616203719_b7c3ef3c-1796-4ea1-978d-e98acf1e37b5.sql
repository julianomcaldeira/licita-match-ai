CREATE OR REPLACE FUNCTION public.list_cliente_licitacoes(p_empresa_id uuid, p_search text DEFAULT NULL::text, p_uf text DEFAULT NULL::text, p_modalidade text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_only_vencidas boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, objeto text, orgao text, modalidade text, uf text, municipio text, valor_estimado numeric, valor_homologado numeric, situacao text, data_publicacao date, match_source text, valor_vencido numeric, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE v_kw text[];
BEGIN
  SELECT COALESCE(ec.palavras_chave, ARRAY[]::text[]) || COALESCE(ec.segmentos, ARRAY[]::text[])
    INTO v_kw FROM public.empresas_clientes ec WHERE ec.id = p_empresa_id;

  RETURN QUERY
  WITH vit AS (
    SELECT cv.licitacao_id AS lic_id, SUM(cv.valor) AS vlr_vencido
    FROM public.cliente_vinculos cv
    WHERE cv.empresa_id = p_empresa_id AND cv.tipo = 'licitacao_vencedor' AND cv.licitacao_id IS NOT NULL
    GROUP BY cv.licitacao_id
  ),
  kw AS (
    SELECT l.id AS lic_id FROM public.licitacoes l
    WHERE NOT p_only_vencidas AND v_kw IS NOT NULL AND array_length(v_kw,1) > 0
      AND EXISTS (SELECT 1 FROM unnest(v_kw) term WHERE term <> '' AND l.objeto ILIKE '%'||term||'%')
  ),
  base AS (
    SELECT lic_id, vlr_vencido, 'cnpj'::text src FROM vit
    UNION SELECT lic_id, NULL::numeric, 'keyword' FROM kw
  ),
  merged AS (
    SELECT lic_id, MAX(vlr_vencido) AS vlr_vencido,
           CASE WHEN COUNT(*) > 1 THEN 'both' ELSE MAX(src) END AS src
    FROM base GROUP BY lic_id
  ),
  enriched AS (
    SELECT l.id AS lic_id, l.objeto AS lic_objeto, l.orgao AS lic_orgao, l.modalidade AS lic_modalidade,
           l.uf AS lic_uf, l.municipio AS lic_municipio,
           l.valor_estimado AS lic_valor_estimado, l.valor_homologado AS lic_valor_homologado,
           l.situacao AS lic_situacao, l.data_publicacao AS lic_data_publicacao,
           m.src AS lic_match_source, m.vlr_vencido AS lic_vlr_vencido
    FROM merged m JOIN public.licitacoes l ON l.id = m.lic_id
    WHERE (p_search IS NULL OR l.objeto ILIKE '%'||p_search||'%' OR l.orgao ILIKE '%'||p_search||'%')
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_modalidade IS NULL OR l.modalidade = p_modalidade)
      AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
      AND (p_date_to   IS NULL OR l.data_publicacao <= p_date_to)
  ),
  counted AS (SELECT count(*)::bigint c FROM enriched)
  SELECT e.lic_id, e.lic_objeto, e.lic_orgao, e.lic_modalidade, e.lic_uf, e.lic_municipio,
         e.lic_valor_estimado, e.lic_valor_homologado, e.lic_situacao, e.lic_data_publicacao,
         e.lic_match_source, e.lic_vlr_vencido, (SELECT c FROM counted)
  FROM enriched e
  ORDER BY e.lic_data_publicacao DESC NULLS LAST
  LIMIT GREATEST(LEAST(p_limit, 500), 1) OFFSET GREATEST(p_offset, 0);
END;
$function$;