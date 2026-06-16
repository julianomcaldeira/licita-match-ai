-- =========================================================
-- 1. Sanitizador de palavras-chave (lowercase + tokens limpos)
-- =========================================================
CREATE OR REPLACE FUNCTION public.sanitize_keywords(p_kw text[])
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_out text[] := ARRAY[]::text[];
  v_item text;
  v_piece text;
  v_clean text;
  v_changed boolean;
  v_pref text;
  v_stopwords text[] := ARRAY[
    'incluindo','inclusive','como','tais','tais como','tal','tal como',
    'e','ou','para','de','da','do','das','dos','com','sem','em',
    'a','o','as','os','ao','aos','no','na','nos','nas','um','uma',
    'tipo','tipos','modelo','modelos','equivalentes','similares','correlatos'
  ];
BEGIN
  IF p_kw IS NULL THEN RETURN ARRAY[]::text[]; END IF;

  FOREACH v_item IN ARRAY p_kw LOOP
    FOR v_piece IN SELECT regexp_split_to_table(COALESCE(v_item,''), '[,;|\n\r]+') LOOP
      v_clean := lower(btrim(v_piece));
      IF v_clean = '' THEN CONTINUE; END IF;

      v_changed := true;
      WHILE v_changed LOOP
        v_changed := false;
        FOREACH v_pref IN ARRAY v_stopwords LOOP
          IF v_clean LIKE v_pref || ' %' THEN
            v_clean := btrim(substring(v_clean FROM length(v_pref)+2));
            v_changed := true;
          END IF;
        END LOOP;
      END LOOP;

      v_changed := true;
      WHILE v_changed LOOP
        v_changed := false;
        FOREACH v_pref IN ARRAY v_stopwords LOOP
          IF v_clean LIKE '% ' || v_pref THEN
            v_clean := btrim(substring(v_clean FROM 1 FOR length(v_clean)-length(v_pref)-1));
            v_changed := true;
          END IF;
        END LOOP;
      END LOOP;

      IF v_clean = '' THEN CONTINUE; END IF;
      IF length(v_clean) < 3 THEN CONTINUE; END IF;
      IF length(v_clean) > 60 THEN CONTINUE; END IF;
      IF v_clean = ANY(v_stopwords) THEN CONTINUE; END IF;

      v_out := v_out || v_clean;
    END LOOP;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT t ORDER BY t), ARRAY[]::text[])
    INTO v_out FROM unnest(v_out) t;
  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sanitize_keywords(text[]) TO authenticated, service_role;

-- =========================================================
-- 2. Trigger BEFORE INSERT/UPDATE em empresas_clientes
-- =========================================================
CREATE OR REPLACE FUNCTION public.empresas_clientes_sanitize_kw()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.palavras_chave := public.sanitize_keywords(NEW.palavras_chave);
  NEW.segmentos     := public.sanitize_keywords(NEW.segmentos);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_empresas_clientes_sanitize_kw ON public.empresas_clientes;
CREATE TRIGGER trg_empresas_clientes_sanitize_kw
BEFORE INSERT OR UPDATE OF palavras_chave, segmentos ON public.empresas_clientes
FOR EACH ROW EXECUTE FUNCTION public.empresas_clientes_sanitize_kw();

-- Re-aplica nas linhas existentes
UPDATE public.empresas_clientes
  SET palavras_chave = palavras_chave,
      segmentos      = segmentos;

-- =========================================================
-- 3. RPCs usando lower() (índice idx_licitacoes_objeto_lower_trgm existente)
-- =========================================================
DO $$ BEGIN
  EXECUTE 'DROP FUNCTION IF EXISTS public.list_cliente_licitacoes(uuid, text, text, text, date, date, boolean, integer, integer)';
  EXECUTE 'DROP FUNCTION IF EXISTS public.list_cliente_mercado(uuid, text, text, text, date, date, boolean, integer, integer)';
  EXECUTE 'DROP FUNCTION IF EXISTS public.cliente_resumo(uuid)';
END $$;

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
      AND EXISTS (
        SELECT 1 FROM unnest(v_kw) term
        WHERE term <> '' AND lower(l.objeto) LIKE '%'||lower(term)||'%'
      )
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
    WHERE (p_search IS NULL OR lower(l.objeto) LIKE '%'||lower(p_search)||'%' OR lower(l.orgao) LIKE '%'||lower(p_search)||'%')
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
$$;

GRANT EXECUTE ON FUNCTION public.list_cliente_licitacoes(uuid, text, text, text, date, date, boolean, integer, integer) TO authenticated, service_role;

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
DECLARE v_kw text[];
BEGIN
  SELECT COALESCE(ec.palavras_chave, ARRAY[]::text[]) || COALESCE(ec.segmentos, ARRAY[]::text[])
    INTO v_kw FROM public.empresas_clientes ec WHERE ec.id = p_empresa_id;

  IF v_kw IS NULL OR array_length(v_kw, 1) IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH won_lics AS (
    SELECT DISTINCT cv.licitacao_id
    FROM public.cliente_vinculos cv
    WHERE cv.empresa_id = p_empresa_id AND cv.tipo = 'licitacao_vencedor' AND cv.licitacao_id IS NOT NULL
  ),
  matched AS (
    SELECT l.id AS lic_id FROM public.licitacoes l
    WHERE EXISTS (
      SELECT 1 FROM unnest(v_kw) term
      WHERE term <> '' AND lower(l.objeto) LIKE '%'||lower(term)||'%'
    )
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
    SELECT l.id AS lic_id, l.objeto AS lic_objeto, l.orgao AS lic_orgao,
           l.modalidade AS lic_modalidade, l.uf AS lic_uf, l.municipio AS lic_municipio,
           l.valor_estimado AS lic_valor_estimado, l.valor_homologado AS lic_valor_homologado,
           l.situacao AS lic_situacao, l.data_publicacao AS lic_data_publicacao,
           l.data_resultado AS lic_data_resultado,
           w.razao_social AS w_nome, w.cnpj AS w_cnpj, w.valor_final AS w_valor,
           COALESCE(w.total_w, 0) AS w_total
    FROM matched m JOIN public.licitacoes l ON l.id = m.lic_id
    LEFT JOIN winners w ON w.licitacao_id = l.id
    WHERE (p_search IS NULL OR lower(l.objeto) LIKE '%'||lower(p_search)||'%' OR lower(l.orgao) LIKE '%'||lower(p_search)||'%')
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_modalidade IS NULL OR l.modalidade = p_modalidade)
      AND (p_date_from IS NULL OR l.data_publicacao >= p_date_from)
      AND (p_date_to   IS NULL OR l.data_publicacao <= p_date_to)
      AND (NOT p_only_homologadas OR l.valor_homologado IS NOT NULL)
  ),
  counted AS (SELECT count(*)::bigint c FROM enriched)
  SELECT e.lic_id, e.lic_objeto, e.lic_orgao, e.lic_modalidade, e.lic_uf, e.lic_municipio,
         e.lic_valor_estimado, e.lic_valor_homologado, e.lic_situacao,
         e.lic_data_publicacao, e.lic_data_resultado,
         e.w_nome, e.w_cnpj, e.w_valor, e.w_total,
         (SELECT c FROM counted)
  FROM enriched e
  ORDER BY e.lic_data_publicacao DESC NULLS LAST
  LIMIT GREATEST(LEAST(p_limit, 500), 1) OFFSET GREATEST(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_cliente_mercado(uuid, text, text, text, date, date, boolean, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cliente_resumo(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET statement_timeout = '25s'
AS $$
DECLARE
  v_kw text[];
  v_vitorias int := 0;
  v_valor_vencido numeric := 0;
  v_contratos int := 0;
  v_ticket numeric := 0;
  v_mercado_total int := 0;
  v_mercado_homologado numeric := 0;
  v_top_orgaos jsonb;
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

  IF v_kw IS NOT NULL AND array_length(v_kw, 1) IS NOT NULL THEN
    SELECT COUNT(*), COALESCE(SUM(l.valor_homologado), 0)
      INTO v_mercado_total, v_mercado_homologado
      FROM public.licitacoes l
      WHERE EXISTS (
        SELECT 1 FROM unnest(v_kw) term
        WHERE term <> '' AND lower(l.objeto) LIKE '%'||lower(term)||'%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.cliente_vinculos cv
        WHERE cv.empresa_id = p_empresa_id AND cv.tipo = 'licitacao_vencedor'
          AND cv.licitacao_id = l.id
      );
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