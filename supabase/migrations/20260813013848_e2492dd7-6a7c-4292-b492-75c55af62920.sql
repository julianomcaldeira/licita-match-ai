CREATE OR REPLACE FUNCTION public.search_licitacoes_por_vencedor_fast(
  p_vencedores text[],
  p_sort text DEFAULT 'recentes',
  p_limit integer DEFAULT 21,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, orgao text, objeto text, modalidade text,
  valor_estimado numeric, valor_homologado numeric, data_publicacao text,
  uf text, situacao text, municipio text, numero_controle_pncp text,
  vencedor_nome text, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order text;
  v_sql text;
BEGIN
  IF cardinality(COALESCE(p_vencedores, '{}')) = 0 THEN
    RETURN;
  END IF;

  v_order := CASE lower(COALESCE(p_sort, 'recentes'))
    WHEN 'valor' THEN 'l.valor_homologado DESC NULLS LAST, l.valor_estimado DESC NULLS LAST'
    WHEN 'estimado' THEN 'l.valor_estimado DESC NULLS LAST, l.data_publicacao DESC NULLS LAST'
    ELSE 'l.data_publicacao DESC NULLS LAST, l.valor_homologado DESC NULLS LAST'
  END;

  v_sql := '
    WITH matched AS MATERIALIZED (
      SELECT DISTINCT li.licitacao_id
      FROM licitacao_vencedores lv
      JOIN licitacao_itens li ON li.id = lv.item_id
      WHERE lv.razao_social = ANY($1)
    )
    SELECT l.id, l.orgao, l.objeto, l.modalidade, l.valor_estimado, l.valor_homologado,
           l.data_publicacao::text, l.uf, l.situacao, l.municipio, l.numero_controle_pncp,
           $4::text, (SELECT count(*) FROM matched)::bigint
    FROM matched x
    JOIN licitacoes l ON l.id = x.licitacao_id
    ORDER BY ' || v_order || '
    LIMIT $2 OFFSET $3';

  RETURN QUERY EXECUTE v_sql USING
    p_vencedores,
    GREATEST(COALESCE(p_limit, 21), 1),
    GREATEST(COALESCE(p_offset, 0), 0),
    p_vencedores[1];
END;
$function$;

REVOKE ALL ON FUNCTION public.search_licitacoes_por_vencedor_fast(text[],text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_licitacoes_por_vencedor_fast(text[],text,integer,integer) TO anon, authenticated, service_role;