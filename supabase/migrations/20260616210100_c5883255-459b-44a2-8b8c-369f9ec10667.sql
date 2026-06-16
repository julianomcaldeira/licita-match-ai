DO $$ BEGIN
  EXECUTE 'DROP FUNCTION IF EXISTS public.list_cliente_licitacoes(uuid, text, text, text, date, date, boolean, integer, integer)';
  EXECUTE 'DROP FUNCTION IF EXISTS public.list_cliente_mercado(uuid, text, text, text, date, date, boolean, integer, integer)';
  EXECUTE 'DROP FUNCTION IF EXISTS public.cliente_resumo(uuid)';
END $$;

-- Helper interno: monta '(lower(objeto) LIKE $literal OR ... )' com cada termo literal
CREATE OR REPLACE FUNCTION public._kw_or_clause(p_kw text[])
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_term text;
  v_parts text[] := ARRAY[]::text[];
BEGIN
  IF p_kw IS NULL OR array_length(p_kw,1) IS NULL THEN
    RETURN 'false';
  END IF;
  FOREACH v_term IN ARRAY p_kw LOOP
    IF v_term IS NULL OR btrim(v_term) = '' THEN CONTINUE; END IF;
    v_parts := v_parts || ('lower(objeto) LIKE ' || quote_literal('%' || lower(v_term) || '%'));
  END LOOP;
  IF array_length(v_parts,1) IS NULL THEN RETURN 'false'; END IF;
  RETURN '(' || array_to_string(v_parts, ' OR ') || ')';
END;
$$;

-- ---------- list_cliente_licitacoes ----------
CREATE OR REPLACE FUNCTION public.list_cliente_licitacoes(
  p_empresa_id uuid, p_search text DEFAULT NULL, p_uf text DEFAULT NULL,
  p_modalidade text DEFAULT NULL, p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL,
  p_only_vencidas boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, objeto text, orgao text, modalidade text, uf text, municipio text,
  valor_estimado numeric, valor_homologado numeric, situacao text,
  data_publicacao date, match_source text, valor_vencido numeric, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET statement_timeout = '25s'
AS $$
DECLARE
  v_kw text[];
  v_kw_clause text;
  v_sql text;
BEGIN
  SELECT COALESCE(ec.palavras_chave, ARRAY[]::text[]) || COALESCE(ec.segmentos, ARRAY[]::text[])
    INTO v_kw FROM public.empresas_clientes ec WHERE ec.id = p_empresa_id;

  v_kw_clause := public._kw_or_clause(v_kw);

  v_sql := format($f$
    WITH vit AS (
      SELECT cv.licitacao_id AS lic_id, SUM(cv.valor) AS vlr_vencido
      FROM public.cliente_vinculos cv
      WHERE cv.empresa_id = %L AND cv.tipo = 'licitacao_vencedor' AND cv.licitacao_id IS NOT NULL
      GROUP BY cv.licitacao_id
    ),
    kw AS (
      SELECT id AS lic_id FROM public.licitacoes
      WHERE %s AND %L::boolean = false
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
      SELECT l.id, l.objeto, l.orgao, l.modalidade, l.uf, l.municipio,
             l.valor_estimado, l.valor_homologado, l.situacao, l.data_publicacao,
             m.src AS match_source, m.vlr_vencido AS valor_vencido
      FROM merged m JOIN public.licitacoes l ON l.id = m.lic_id
      WHERE (%L::text IS NULL OR lower(l.objeto) LIKE '%%'||lower(%L)||'%%' OR lower(l.orgao) LIKE '%%'||lower(%L)||'%%')
        AND (%L::text IS NULL OR l.uf = %L)
        AND (%L::text IS NULL OR l.modalidade = %L)
        AND (%L::date IS NULL OR l.data_publicacao >= %L)
        AND (%L::date IS NULL OR l.data_publicacao <= %L)
    ),
    counted AS (SELECT count(*)::bigint c FROM enriched)
    SELECT e.id, e.objeto, e.orgao, e.modalidade, e.uf, e.municipio,
           e.valor_estimado, e.valor_homologado, e.situacao, e.data_publicacao,
           e.match_source, e.valor_vencido, (SELECT c FROM counted)
    FROM enriched e
    ORDER BY e.data_publicacao DESC NULLS LAST
    LIMIT %s OFFSET %s
  $f$,
    p_empresa_id, v_kw_clause, p_only_vencidas,
    p_search, p_search, p_search,
    p_uf, p_uf, p_modalidade, p_modalidade,
    p_date_from, p_date_from, p_date_to, p_date_to,
    GREATEST(LEAST(p_limit, 500), 1), GREATEST(p_offset, 0)
  );

  RETURN QUERY EXECUTE v_sql;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_cliente_licitacoes(uuid, text, text, text, date, date, boolean, integer, integer) TO authenticated, service_role;

-- ---------- list_cliente_mercado ----------
CREATE OR REPLACE FUNCTION public.list_cliente_mercado(
  p_empresa_id uuid, p_search text DEFAULT NULL, p_uf text DEFAULT NULL,
  p_modalidade text DEFAULT NULL, p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL,
  p_only_homologadas boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, objeto text, orgao text, modalidade text, uf text, municipio text,
  valor_estimado numeric, valor_homologado numeric, situacao text,
  data_publicacao date, data_resultado date,
  vencedor_nome text, vencedor_cnpj text, vencedor_valor numeric,
  total_vencedores integer, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET statement_timeout = '25s'
AS $$
DECLARE
  v_kw text[];
  v_kw_clause text;
  v_sql text;
BEGIN
  SELECT COALESCE(ec.palavras_chave, ARRAY[]::text[]) || COALESCE(ec.segmentos, ARRAY[]::text[])
    INTO v_kw FROM public.empresas_clientes ec WHERE ec.id = p_empresa_id;

  IF v_kw IS NULL OR array_length(v_kw, 1) IS NULL THEN RETURN; END IF;

  v_kw_clause := public._kw_or_clause(v_kw);
  IF v_kw_clause = 'false' THEN RETURN; END IF;

  v_sql := format($f$
    WITH won_lics AS (
      SELECT DISTINCT cv.licitacao_id
      FROM public.cliente_vinculos cv
      WHERE cv.empresa_id = %L AND cv.tipo = 'licitacao_vencedor' AND cv.licitacao_id IS NOT NULL
    ),
    matched AS (
      SELECT id AS lic_id FROM public.licitacoes l
      WHERE %s
        AND NOT EXISTS (SELECT 1 FROM won_lics w WHERE w.licitacao_id = l.id)
    ),
    winners AS (
      SELECT DISTINCT ON (li.licitacao_id)
        li.licitacao_id, lv.razao_social, lv.cnpj, lv.valor_final,
        (SELECT count(*)::int FROM public.licitacao_vencedores lv2
           JOIN public.licitacao_itens li2 ON li2.id = lv2.item_id
           WHERE li2.licitacao_id = li.licitacao_id) AS total_w
      FROM public.licitacao_itens li
      JOIN public.licitacao_vencedores lv ON lv.item_id = li.id
      WHERE li.licitacao_id IN (SELECT lic_id FROM matched)
      ORDER BY li.licitacao_id, lv.valor_final DESC NULLS LAST
    ),
    enriched AS (
      SELECT l.id, l.objeto, l.orgao, l.modalidade, l.uf, l.municipio,
             l.valor_estimado, l.valor_homologado, l.situacao,
             l.data_publicacao, l.data_resultado,
             w.razao_social AS vencedor_nome, w.cnpj AS vencedor_cnpj,
             w.valor_final AS vencedor_valor, COALESCE(w.total_w,0) AS total_vencedores
      FROM matched m JOIN public.licitacoes l ON l.id = m.lic_id
      LEFT JOIN winners w ON w.licitacao_id = l.id
      WHERE (%L::text IS NULL OR lower(l.objeto) LIKE '%%'||lower(%L)||'%%' OR lower(l.orgao) LIKE '%%'||lower(%L)||'%%')
        AND (%L::text IS NULL OR l.uf = %L)
        AND (%L::text IS NULL OR l.modalidade = %L)
        AND (%L::date IS NULL OR l.data_publicacao >= %L)
        AND (%L::date IS NULL OR l.data_publicacao <= %L)
        AND (NOT %L::boolean OR l.valor_homologado IS NOT NULL)
    ),
    counted AS (SELECT count(*)::bigint c FROM enriched)
    SELECT e.id, e.objeto, e.orgao, e.modalidade, e.uf, e.municipio,
           e.valor_estimado, e.valor_homologado, e.situacao,
           e.data_publicacao, e.data_resultado,
           e.vencedor_nome, e.vencedor_cnpj, e.vencedor_valor, e.total_vencedores,
           (SELECT c FROM counted)
    FROM enriched e
    ORDER BY e.data_publicacao DESC NULLS LAST
    LIMIT %s OFFSET %s
  $f$,
    p_empresa_id, v_kw_clause,
    p_search, p_search, p_search,
    p_uf, p_uf, p_modalidade, p_modalidade,
    p_date_from, p_date_from, p_date_to, p_date_to,
    p_only_homologadas,
    GREATEST(LEAST(p_limit, 500), 1), GREATEST(p_offset, 0)
  );

  RETURN QUERY EXECUTE v_sql;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_cliente_mercado(uuid, text, text, text, date, date, boolean, integer, integer) TO authenticated, service_role;

-- ---------- cliente_resumo ----------
CREATE OR REPLACE FUNCTION public.cliente_resumo(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET statement_timeout = '25s'
AS $$
DECLARE
  v_kw text[];
  v_kw_clause text;
  v_vitorias int := 0;
  v_valor_vencido numeric := 0;
  v_contratos int := 0;
  v_ticket numeric := 0;
  v_mercado_total int := 0;
  v_mercado_homologado numeric := 0;
  v_top_orgaos jsonb;
  v_sql text;
BEGIN
  SELECT COALESCE(ec.palavras_chave, ARRAY[]::text[]) || COALESCE(ec.segmentos, ARRAY[]::text[])
    INTO v_kw FROM public.empresas_clientes ec WHERE ec.id = p_empresa_id;

  SELECT COUNT(DISTINCT cv.licitacao_id), COALESCE(SUM(cv.valor), 0)
    INTO v_vitorias, v_valor_vencido
    FROM public.cliente_vinculos cv
    WHERE cv.empresa_id = p_empresa_id AND cv.tipo = 'licitacao_vencedor';

  SELECT COUNT(*) INTO v_contratos
    FROM public.cliente_vinculos cv
    WHERE cv.empresa_id = p_empresa_id AND cv.tipo = 'contrato';

  IF v_vitorias > 0 THEN v_ticket := v_valor_vencido / v_vitorias; END IF;

  v_kw_clause := public._kw_or_clause(v_kw);
  IF v_kw_clause <> 'false' THEN
    v_sql := format($f$
      SELECT COUNT(*)::int, COALESCE(SUM(valor_homologado),0)::numeric
      FROM public.licitacoes l
      WHERE %s
        AND NOT EXISTS (
          SELECT 1 FROM public.cliente_vinculos cv
          WHERE cv.empresa_id = %L AND cv.tipo = 'licitacao_vencedor'
            AND cv.licitacao_id = l.id
        )
    $f$, v_kw_clause, p_empresa_id);
    EXECUTE v_sql INTO v_mercado_total, v_mercado_homologado;
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'valor')::numeric DESC), '[]'::jsonb)
    INTO v_top_orgaos
    FROM (
      SELECT jsonb_build_object('orgao', l.orgao, 'valor', SUM(cv.valor), 'qtd', COUNT(*)) AS t
      FROM public.cliente_vinculos cv
      JOIN public.licitacoes l ON l.id = cv.licitacao_id
      WHERE cv.empresa_id = p_empresa_id AND cv.tipo = 'licitacao_vencedor'
      GROUP BY l.orgao
      ORDER BY SUM(cv.valor) DESC NULLS LAST
      LIMIT 5
    ) s;

  RETURN jsonb_build_object(
    'vitorias', v_vitorias,
    'valor_total_vencido', v_valor_vencido,
    'contratos', v_contratos,
    'ticket_medio', v_ticket,
    'mercado_total', v_mercado_total,
    'mercado_valor_homologado', v_mercado_homologado,
    'top_orgaos', COALESCE(v_top_orgaos, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cliente_resumo(uuid) TO authenticated, service_role;