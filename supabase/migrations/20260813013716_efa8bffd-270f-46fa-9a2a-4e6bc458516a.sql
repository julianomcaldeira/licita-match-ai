CREATE OR REPLACE FUNCTION public.search_licitacoes_v2(
  p_terms text[] DEFAULT NULL,
  p_terms_mode text DEFAULT 'all',
  p_itens text[] DEFAULT NULL,
  p_itens_mode text DEFAULT 'all',
  p_orgaos text[] DEFAULT NULL,
  p_ufs text[] DEFAULT NULL,
  p_situacoes text[] DEFAULT NULL,
  p_modalidades text[] DEFAULT NULL,
  p_vencedores text[] DEFAULT NULL,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL,
  p_com_vencedor boolean DEFAULT false,
  p_sem_resultado boolean DEFAULT false,
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
  v_sql text;
  v_terms text[];
  v_itens text[];
  v_order text;
BEGIN
  SELECT ARRAY(SELECT lower(trim(t)) FROM unnest(COALESCE(p_terms, '{}')) t WHERE length(trim(t)) >= 2)
    INTO v_terms;
  SELECT ARRAY(SELECT lower(trim(t)) FROM unnest(COALESCE(p_itens, '{}')) t WHERE length(trim(t)) >= 2)
    INTO v_itens;

  v_order := CASE lower(COALESCE(p_sort, 'recentes'))
    WHEN 'valor' THEN 'l.valor_homologado DESC NULLS LAST, l.valor_estimado DESC NULLS LAST'
    WHEN 'estimado' THEN 'l.valor_estimado DESC NULLS LAST, l.data_publicacao DESC NULLS LAST'
    ELSE 'l.data_publicacao DESC NULLS LAST, l.valor_homologado DESC NULLS LAST'
  END;

  -- Vencedores escolhidos no combobox são nomes canônicos. Esta rota seletiva
  -- usa igualdade/index btree e começa pelos vencedores, nunca pela tabela inteira.
  IF cardinality(COALESCE(p_vencedores, '{}')) > 0 THEN
    v_sql := '
      WITH matched AS MATERIALIZED (
        SELECT DISTINCT li.licitacao_id
        FROM licitacao_vencedores lv
        JOIN licitacao_itens li ON li.id = lv.item_id
        WHERE lv.razao_social = ANY($11)
      )
      SELECT l.id, l.orgao, l.objeto, l.modalidade, l.valor_estimado, l.valor_homologado,
             l.data_publicacao::text, l.uf, l.situacao, l.municipio, l.numero_controle_pncp,
             w.razao_social, NULL::bigint
      FROM matched x
      JOIN licitacoes l ON l.id = x.licitacao_id
      LEFT JOIN LATERAL (
        SELECT lv2.razao_social
        FROM licitacao_itens li2
        JOIN licitacao_vencedores lv2 ON lv2.item_id = li2.id
        WHERE li2.licitacao_id = l.id AND lv2.razao_social IS NOT NULL
        ORDER BY lv2.valor_final DESC NULLS LAST
        LIMIT 1
      ) w ON true
      WHERE ($1 IS NULL OR l.data_publicacao >= $1::date)
        AND ($2 IS NULL OR l.data_publicacao <= $2::date)
        AND (cardinality($3) = 0 OR l.uf = ANY($3))
        AND (cardinality($4) = 0 OR EXISTS (SELECT 1 FROM unnest($4) s WHERE l.situacao ILIKE ''%'' || s || ''%''))
        AND (cardinality($5) = 0 OR EXISTS (SELECT 1 FROM unnest($5) m WHERE l.modalidade ILIKE ''%'' || m || ''%''))
        AND (cardinality($6) = 0 OR EXISTS (SELECT 1 FROM unnest($6) o WHERE l.orgao ILIKE ''%'' || o || ''%''))
        AND (NOT $7 OR l.valor_homologado > 0)
        AND (NOT $8 OR (COALESCE(l.valor_homologado, 0) = 0 AND COALESCE(l.situacao, '''') NOT IN (''Revogada'', ''Anulada'')))
        AND (cardinality($9) = 0 OR
          (lower(COALESCE($14, ''all'')) = ''any'' AND EXISTS (SELECT 1 FROM unnest($9) t WHERE lower(l.objeto) LIKE ''%'' || t || ''%'')) OR
          (lower(COALESCE($14, ''all'')) <> ''any'' AND NOT EXISTS (SELECT 1 FROM unnest($9) t WHERE lower(l.objeto) NOT LIKE ''%'' || t || ''%'')))
        AND (cardinality($10) = 0 OR
          (lower(COALESCE($15, ''all'')) = ''any'' AND EXISTS (SELECT 1 FROM licitacao_itens li3 WHERE li3.licitacao_id = l.id AND EXISTS (SELECT 1 FROM unnest($10) t WHERE lower(li3.descricao) LIKE ''%'' || t || ''%''))) OR
          (lower(COALESCE($15, ''all'')) <> ''any'' AND EXISTS (SELECT 1 FROM licitacao_itens li3 WHERE li3.licitacao_id = l.id AND NOT EXISTS (SELECT 1 FROM unnest($10) t WHERE lower(li3.descricao) NOT LIKE ''%'' || t || ''%''))))
      ORDER BY ' || v_order || '
      LIMIT $12 OFFSET $13';

    RETURN QUERY EXECUTE v_sql USING
      NULLIF(trim(COALESCE(p_date_from, '')), ''),
      NULLIF(trim(COALESCE(p_date_to, '')), ''),
      COALESCE(p_ufs, '{}'), COALESCE(p_situacoes, '{}'), COALESCE(p_modalidades, '{}'),
      COALESCE(p_orgaos, '{}'), COALESCE(p_com_vencedor, false), COALESCE(p_sem_resultado, false),
      v_terms, v_itens, COALESCE(p_vencedores, '{}'),
      GREATEST(COALESCE(p_limit, 21), 1), GREATEST(COALESCE(p_offset, 0), 0),
      p_terms_mode, p_itens_mode;
    RETURN;
  END IF;

  v_sql := '
    SELECT l.id, l.orgao, l.objeto, l.modalidade, l.valor_estimado, l.valor_homologado,
           l.data_publicacao::text, l.uf, l.situacao, l.municipio, l.numero_controle_pncp,
           NULL::text, NULL::bigint
    FROM licitacoes l
    WHERE ($1 IS NULL OR l.data_publicacao >= $1::date)
      AND ($2 IS NULL OR l.data_publicacao <= $2::date)
      AND (cardinality($3) = 0 OR l.uf = ANY($3))
      AND (cardinality($4) = 0 OR EXISTS (SELECT 1 FROM unnest($4) s WHERE l.situacao ILIKE ''%'' || s || ''%''))
      AND (cardinality($5) = 0 OR EXISTS (SELECT 1 FROM unnest($5) m WHERE l.modalidade ILIKE ''%'' || m || ''%''))
      AND (cardinality($6) = 0 OR EXISTS (SELECT 1 FROM unnest($6) o WHERE l.orgao ILIKE ''%'' || o || ''%''))
      AND (NOT $7 OR l.valor_homologado > 0)
      AND (NOT $8 OR (COALESCE(l.valor_homologado, 0) = 0 AND COALESCE(l.situacao, '''') NOT IN (''Revogada'', ''Anulada'')))';

  IF cardinality(v_terms) > 0 THEN
    IF lower(COALESCE(p_terms_mode, 'all')) = 'any' THEN
      v_sql := v_sql || ' AND EXISTS (SELECT 1 FROM unnest($9) t WHERE lower(l.objeto) LIKE ''%'' || t || ''%'')';
    ELSE
      v_sql := v_sql || ' AND NOT EXISTS (SELECT 1 FROM unnest($9) t WHERE lower(l.objeto) NOT LIKE ''%'' || t || ''%'')';
    END IF;
  END IF;

  IF cardinality(v_itens) > 0 THEN
    IF lower(COALESCE(p_itens_mode, 'all')) = 'any' THEN
      v_sql := v_sql || ' AND EXISTS (SELECT 1 FROM licitacao_itens li WHERE li.licitacao_id = l.id
          AND EXISTS (SELECT 1 FROM unnest($10) t WHERE lower(li.descricao) LIKE ''%'' || t || ''%''))';
    ELSE
      v_sql := v_sql || ' AND EXISTS (SELECT 1 FROM licitacao_itens li WHERE li.licitacao_id = l.id
          AND NOT EXISTS (SELECT 1 FROM unnest($10) t WHERE lower(li.descricao) NOT LIKE ''%'' || t || ''%''))';
    END IF;
  END IF;

  v_sql := v_sql || ' ORDER BY ' || v_order || ' LIMIT $12 OFFSET $13';
  v_sql := '
    SELECT b.id, b.orgao, b.objeto, b.modalidade, b.valor_estimado, b.valor_homologado,
           b.data_publicacao, b.uf, b.situacao, b.municipio, b.numero_controle_pncp,
           w.razao_social, NULL::bigint
    FROM (' || v_sql || ') AS b(id, orgao, objeto, modalidade, valor_estimado, valor_homologado,
           data_publicacao, uf, situacao, municipio, numero_controle_pncp, vencedor_nome, total_count)
    LEFT JOIN LATERAL (
      SELECT lv.razao_social
      FROM licitacao_itens li3
      JOIN licitacao_vencedores lv ON lv.item_id = li3.id
      WHERE li3.licitacao_id = b.id AND lv.razao_social IS NOT NULL
      ORDER BY lv.valor_final DESC NULLS LAST LIMIT 1
    ) w ON true';

  RETURN QUERY EXECUTE v_sql USING
    NULLIF(trim(COALESCE(p_date_from, '')), ''), NULLIF(trim(COALESCE(p_date_to, '')), ''),
    COALESCE(p_ufs, '{}'), COALESCE(p_situacoes, '{}'), COALESCE(p_modalidades, '{}'),
    COALESCE(p_orgaos, '{}'), COALESCE(p_com_vencedor, false), COALESCE(p_sem_resultado, false),
    v_terms, v_itens, COALESCE(p_vencedores, '{}'),
    GREATEST(COALESCE(p_limit, 21), 1), GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.search_licitacoes_v2(text[],text,text[],text,text[],text[],text[],text[],text[],text,text,boolean,boolean,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_licitacoes_v2(text[],text,text[],text,text[],text[],text[],text[],text[],text,text,boolean,boolean,text,integer,integer) TO anon, authenticated, service_role;