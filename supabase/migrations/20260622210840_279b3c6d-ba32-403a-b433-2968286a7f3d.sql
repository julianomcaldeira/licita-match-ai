
CREATE OR REPLACE FUNCTION public.list_cliente_contratos(
  p_empresa_id uuid,
  p_search text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_only_proprios boolean DEFAULT false,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, cnpj_orgao text, orgao_nome text, numero_contrato text, objeto text,
  fornecedor_nome text, fornecedor_cnpj text, valor_inicial numeric, valor_final numeric,
  data_assinatura date, data_vigencia_inicio date, data_vigencia_fim date,
  situacao text, modalidade_compra text, match_source text, total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_kw text[];
  v_kw_clause text := 'FALSE';
  v_term text;
  v_parts text[] := ARRAY[]::text[];
  v_sql text;
  v_lim int := GREATEST(LEAST(p_limit, 500), 1);
  v_off int := GREATEST(p_offset, 0);
BEGIN
  SELECT COALESCE(ec.palavras_chave, ARRAY[]::text[]) || COALESCE(ec.segmentos, ARRAY[]::text[])
    INTO v_kw FROM public.empresas_clientes ec WHERE ec.id = p_empresa_id;

  IF NOT p_only_proprios AND v_kw IS NOT NULL THEN
    FOREACH v_term IN ARRAY v_kw LOOP
      IF v_term IS NOT NULL AND length(btrim(v_term)) >= 3 THEN
        v_parts := v_parts || format('c.objeto ILIKE %L', '%'||btrim(v_term)||'%');
      END IF;
    END LOOP;
    IF array_length(v_parts,1) > 0 THEN
      v_kw_clause := array_to_string(v_parts, ' OR ');
    END IF;
  END IF;

  v_sql := format($q$
    WITH proprios AS (
      SELECT cv.referencia_id AS ctr_id
      FROM public.cliente_vinculos cv
      WHERE cv.empresa_id = %L AND cv.tipo = 'contrato'
    ),
    kw AS (
      SELECT c.id AS ctr_id
      FROM public.contratos c
      WHERE %s
    ),
    base AS (
      SELECT ctr_id, 'cnpj'::text src FROM proprios
      UNION
      SELECT ctr_id, 'keyword' FROM kw
    ),
    merged AS (
      SELECT ctr_id, CASE WHEN COUNT(*)>1 THEN 'both' ELSE MAX(src) END src
      FROM base GROUP BY ctr_id
    ),
    enriched AS (
      SELECT c.id, c.cnpj_orgao, c.orgao_nome, c.numero_contrato, c.objeto,
             c.fornecedor_nome, c.fornecedor_cnpj, c.valor_inicial, c.valor_final,
             c.data_assinatura, c.data_vigencia_inicio, c.data_vigencia_fim,
             c.situacao, c.modalidade_compra, m.src AS match_source
      FROM merged m JOIN public.contratos c ON c.id = m.ctr_id
      WHERE (%L::text IS NULL OR c.objeto ILIKE '%%'||%L||'%%' OR c.orgao_nome ILIKE '%%'||%L||'%%')
        AND (%L::date IS NULL OR COALESCE(c.data_assinatura, c.data_publicacao) >= %L::date)
        AND (%L::date IS NULL OR COALESCE(c.data_assinatura, c.data_publicacao) <= %L::date)
    ),
    counted AS (SELECT count(*)::bigint c FROM enriched)
    SELECT e.id, e.cnpj_orgao, e.orgao_nome, e.numero_contrato, e.objeto,
           e.fornecedor_nome, e.fornecedor_cnpj, e.valor_inicial, e.valor_final,
           e.data_assinatura, e.data_vigencia_inicio, e.data_vigencia_fim,
           e.situacao, e.modalidade_compra, e.match_source, (SELECT c FROM counted)
    FROM enriched e
    ORDER BY COALESCE(e.data_assinatura, e.data_vigencia_inicio) DESC NULLS LAST
    LIMIT %s OFFSET %s
  $q$,
    p_empresa_id,
    v_kw_clause,
    p_search, p_search, p_search,
    p_date_from, p_date_from,
    p_date_to, p_date_to,
    v_lim, v_off
  );

  RETURN QUERY EXECUTE v_sql;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_cliente_contratos(uuid,text,text,date,date,boolean,integer,integer) TO authenticated, service_role;
