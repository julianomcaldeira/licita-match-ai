
CREATE OR REPLACE FUNCTION public.compute_indice_startgi(p_mes text, p_force boolean DEFAULT false)
 RETURNS indice_startgi_mensal
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '180s'
AS $function$
DECLARE
  v_mes_start date;
  v_mes_end date;
  v_prev_start date;
  v_now timestamptz := now();
  v_deadline date;
  v_parciais boolean;
  v_existing public.indice_startgi_mensal;
  v_valor numeric := 0;
  v_valor_ant numeric := 0;
  v_volume integer := 0;
  v_base numeric;
  v_indice numeric;
  v_indice_mom numeric;
  v_indice_yoy numeric;
  v_var_mom numeric;
  v_var_yoy numeric;
  v_mes_ant text;
  v_mes_yoy text;
  v_mod jsonb := '{}'::jsonb;
  v_esf jsonb := '{}'::jsonb;
  v_seg jsonb := '{}'::jsonb;
  v_seg_det jsonb := '[]'::jsonb;
  v_destaque text;
  v_destaque_var numeric;
  v_top_orgao text; v_top_orgao_v numeric;
  v_top_forn text; v_top_forn_v numeric;
  v_top_mod text; v_top_mod_share numeric;
  v_maior_v numeric; v_maior_obj text;
  v_ticket numeric;
  v_orgaos integer; v_fornec integer;
  v_row public.indice_startgi_mensal;
BEGIN
  IF p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'p_mes deve estar no formato YYYY-MM';
  END IF;

  v_mes_start := to_date(p_mes || '-01', 'YYYY-MM-DD');
  v_mes_end := (v_mes_start + interval '1 month')::date;
  v_prev_start := (v_mes_start - interval '1 month')::date;
  v_deadline := (v_mes_end + interval '10 days')::date;
  v_parciais := (v_now::date < v_deadline);

  SELECT * INTO v_existing FROM public.indice_startgi_mensal WHERE mes_referencia = p_mes;
  IF v_existing.mes_referencia IS NOT NULL AND NOT p_force
     AND v_mes_end < (v_now - interval '60 days')::date THEN
    RETURN v_existing;
  END IF;

  CREATE TEMP TABLE _ctr ON COMMIT DROP AS
  SELECT
    (d.de >= v_mes_start AND d.de < v_mes_end) AS is_cur,
    (d.de >= v_prev_start AND d.de < v_mes_start) AS is_prev,
    COALESCE(c.valor_inicial, 0) AS v,
    c.orgao_nome,
    c.fornecedor_nome,
    c.objeto,
    CASE
      WHEN c.modalidade_compra ILIKE '%preg%'     THEN 'Pregão'
      WHEN c.modalidade_compra ILIKE '%dispensa%' THEN 'Dispensa'
      WHEN c.modalidade_compra ILIKE '%concor%'   THEN 'Concorrência'
      WHEN c.modalidade_compra ILIKE '%inexigib%' THEN 'Inexigibilidade'
      ELSE 'Outros'
    END AS mod_bucket,
    CASE
      WHEN c.orgao_nome ILIKE 'munic%' OR c.orgao_nome ILIKE 'prefeitura%' OR c.orgao_nome ILIKE '%câmara munic%' OR c.orgao_nome ILIKE '%camara munic%' THEN 'municipal'
      WHEN c.orgao_nome ILIKE 'governo do estado%' OR c.orgao_nome ILIKE 'secretaria de estado%' OR c.orgao_nome ILIKE 'assembleia legislativa%' OR c.orgao_nome ILIKE '%governo do distrito federal%' THEN 'estadual'
      WHEN c.orgao_nome ILIKE 'ministério%' OR c.orgao_nome ILIKE 'ministerio%' OR c.orgao_nome ILIKE '%união%' OR c.orgao_nome ILIKE '%uniao%' OR c.orgao_nome ILIKE 'federal%' OR c.orgao_nome ILIKE 'tribunal regional federal%' OR c.orgao_nome ILIKE 'justiça federal%' OR c.orgao_nome ILIKE 'policia federal%' OR c.orgao_nome ILIKE 'polícia federal%' THEN 'federal'
      ELSE 'outros'
    END AS esf_bucket,
    CASE
      WHEN c.objeto ILIKE '%saúde%' OR c.objeto ILIKE '%saude%' OR c.objeto ILIKE '%hospital%' OR c.objeto ILIKE '%medicament%' OR c.objeto ILIKE '%clínic%' OR c.objeto ILIKE '%clinic%' THEN 'Saúde'
      WHEN c.objeto ILIKE '%software%' OR c.objeto ILIKE '%tecnolog%' OR c.objeto ILIKE '%sistema%' OR c.objeto ILIKE '%telecom%' OR c.objeto ILIKE '%computador%' OR c.objeto ILIKE '%TI %' THEN 'TI e Telecom'
      WHEN c.objeto ILIKE '%obra%' OR c.objeto ILIKE '%construç%' OR c.objeto ILIKE '%pavimenta%' OR c.objeto ILIKE '%reforma%' OR c.objeto ILIKE '%infraestrut%' THEN 'Obras'
      WHEN c.objeto ILIKE '%ensino%' OR c.objeto ILIKE '%educa%' OR c.objeto ILIKE '%escola%' OR c.objeto ILIKE '%merenda%' THEN 'Educação'
      WHEN c.objeto ILIKE '%limpeza%' OR c.objeto ILIKE '%vigilânc%' OR c.objeto ILIKE '%vigilanc%' OR c.objeto ILIKE '%manutenç%' OR c.objeto ILIKE '%transporte%' THEN 'Serviços Gerais'
      ELSE 'Outros'
    END AS seg_bucket
  FROM public.contratos c
  CROSS JOIN LATERAL (SELECT COALESCE(c.data_assinatura, c.data_publicacao) AS de) d
  WHERE d.de >= v_prev_start AND d.de < v_mes_end;

  ANALYZE _ctr;

  SELECT
    COALESCE(SUM(v) FILTER (WHERE is_cur), 0),
    COUNT(*) FILTER (WHERE is_cur),
    COALESCE(SUM(v) FILTER (WHERE is_prev), 0)
  INTO v_valor, v_volume, v_valor_ant
  FROM _ctr;

  SELECT valor_total_brl INTO v_base FROM public.indice_startgi_mensal WHERE mes_referencia = '2024-01';
  IF v_base IS NULL THEN
    IF p_mes = '2024-01' THEN
      v_base := v_valor;
    ELSE
      SELECT COALESCE(SUM(COALESCE(valor_inicial, 0)), 0) INTO v_base
      FROM public.contratos
      WHERE COALESCE(data_assinatura, data_publicacao) >= date '2024-01-01'
        AND COALESCE(data_assinatura, data_publicacao) <  date '2024-02-01';
    END IF;
  END IF;

  v_indice := CASE WHEN COALESCE(v_base, 0) > 0 THEN ROUND((v_valor / v_base) * 100, 1) ELSE NULL END;

  v_mes_ant := to_char(v_mes_start - interval '1 month', 'YYYY-MM');
  v_mes_yoy := to_char(v_mes_start - interval '1 year', 'YYYY-MM');
  SELECT indice_startgi INTO v_indice_mom FROM public.indice_startgi_mensal WHERE mes_referencia = v_mes_ant;
  SELECT indice_startgi INTO v_indice_yoy FROM public.indice_startgi_mensal WHERE mes_referencia = v_mes_yoy;

  v_var_mom := CASE WHEN v_indice_mom IS NOT NULL AND v_indice_mom <> 0 AND v_indice IS NOT NULL
                    THEN ROUND(((v_indice - v_indice_mom) / v_indice_mom) * 100, 2) END;
  v_var_yoy := CASE WHEN v_indice_yoy IS NOT NULL AND v_indice_yoy <> 0 AND v_indice IS NOT NULL
                    THEN ROUND(((v_indice - v_indice_yoy) / v_indice_yoy) * 100, 2) END;

  IF v_valor > 0 THEN
    WITH agg AS (
      SELECT mod_bucket AS bucket, SUM(v) AS sv
      FROM _ctr WHERE is_cur GROUP BY mod_bucket
    )
    SELECT
      COALESCE(jsonb_object_agg(bucket, ROUND((sv / v_valor) * 100, 1)), '{}'::jsonb),
      (SELECT bucket FROM agg ORDER BY sv DESC NULLS LAST LIMIT 1),
      (SELECT ROUND((sv / v_valor) * 100, 1) FROM agg ORDER BY sv DESC NULLS LAST LIMIT 1)
    INTO v_mod, v_top_mod, v_top_mod_share
    FROM agg;

    WITH agg AS (
      SELECT esf_bucket AS bucket, SUM(v) AS sv
      FROM _ctr WHERE is_cur GROUP BY esf_bucket
    )
    SELECT COALESCE(jsonb_object_agg(bucket, ROUND((sv / v_valor) * 100, 1)), '{}'::jsonb)
    INTO v_esf FROM agg;

    WITH agg AS (
      SELECT seg_bucket AS bucket,
             SUM(v) FILTER (WHERE is_cur)  AS valor_atual,
             SUM(v) FILTER (WHERE is_prev) AS valor_anterior
      FROM _ctr
      GROUP BY seg_bucket
    ),
    joined AS (
      SELECT bucket AS nome,
             COALESCE(valor_atual, 0)    AS valor_atual,
             COALESCE(valor_anterior, 0) AS valor_anterior,
             CASE WHEN COALESCE(valor_anterior,0) > 0
                  THEN ROUND(((valor_atual - valor_anterior) / valor_anterior) * 100, 1) END AS var_pct,
             CASE WHEN v_valor > 0
                  THEN ROUND((COALESCE(valor_atual,0) / v_valor) * 100, 1) ELSE 0 END AS share_pct
      FROM agg
      WHERE COALESCE(valor_atual,0) > 0
      ORDER BY valor_atual DESC NULLS LAST
    )
    SELECT
      COALESCE(jsonb_object_agg(nome, share_pct), '{}'::jsonb),
      COALESCE(jsonb_agg(to_jsonb(joined)), '[]'::jsonb)
    INTO v_seg, v_seg_det
    FROM joined;

    SELECT nome, var_pct INTO v_destaque, v_destaque_var
    FROM jsonb_to_recordset(v_seg_det) AS x(nome text, valor_atual numeric, valor_anterior numeric, var_pct numeric, share_pct numeric)
    WHERE var_pct IS NOT NULL
    ORDER BY var_pct DESC NULLS LAST
    LIMIT 1;

    SELECT orgao_nome, SUM(v) INTO v_top_orgao, v_top_orgao_v
    FROM _ctr WHERE is_cur AND orgao_nome IS NOT NULL
    GROUP BY orgao_nome ORDER BY 2 DESC NULLS LAST LIMIT 1;

    SELECT fornecedor_nome, SUM(v) INTO v_top_forn, v_top_forn_v
    FROM _ctr WHERE is_cur AND fornecedor_nome IS NOT NULL
    GROUP BY fornecedor_nome ORDER BY 2 DESC NULLS LAST LIMIT 1;

    SELECT v, objeto INTO v_maior_v, v_maior_obj
    FROM _ctr WHERE is_cur ORDER BY v DESC NULLS LAST LIMIT 1;

    v_ticket := CASE WHEN v_volume > 0 THEN ROUND(v_valor / v_volume, 2) END;

    SELECT COUNT(DISTINCT orgao_nome), COUNT(DISTINCT fornecedor_nome)
    INTO v_orgaos, v_fornec
    FROM _ctr WHERE is_cur;
  END IF;

  DROP TABLE IF EXISTS _ctr;

  INSERT INTO public.indice_startgi_mensal AS t (
    mes_referencia, indice_startgi, valor_total_brl, volume_contratos,
    variacao_mom, variacao_yoy, breakdown_modalidade, breakdown_esfera, breakdown_segmento,
    destaque_segmento, destaque_variacao, dados_parciais, ultima_atualizacao,
    top_orgao_nome, top_orgao_valor, top_fornecedor_nome, top_fornecedor_valor,
    top_modalidade, top_modalidade_share, maior_contrato_valor, maior_contrato_objeto,
    ticket_medio, orgaos_unicos, fornecedores_unicos,
    segmentos_detalhe, valor_total_brl_anterior
  ) VALUES (
    p_mes, v_indice, v_valor, v_volume,
    v_var_mom, v_var_yoy, v_mod, v_esf, v_seg,
    v_destaque, v_destaque_var, v_parciais, v_now,
    v_top_orgao, v_top_orgao_v, v_top_forn, v_top_forn_v,
    v_top_mod, v_top_mod_share, v_maior_v, v_maior_obj,
    v_ticket, v_orgaos, v_fornec,
    v_seg_det, v_valor_ant
  )
  ON CONFLICT (mes_referencia) DO UPDATE SET
    indice_startgi = EXCLUDED.indice_startgi,
    valor_total_brl = EXCLUDED.valor_total_brl,
    volume_contratos = EXCLUDED.volume_contratos,
    variacao_mom = EXCLUDED.variacao_mom,
    variacao_yoy = EXCLUDED.variacao_yoy,
    breakdown_modalidade = EXCLUDED.breakdown_modalidade,
    breakdown_esfera = EXCLUDED.breakdown_esfera,
    breakdown_segmento = EXCLUDED.breakdown_segmento,
    destaque_segmento = EXCLUDED.destaque_segmento,
    destaque_variacao = EXCLUDED.destaque_variacao,
    dados_parciais = EXCLUDED.dados_parciais,
    ultima_atualizacao = EXCLUDED.ultima_atualizacao,
    top_orgao_nome = EXCLUDED.top_orgao_nome,
    top_orgao_valor = EXCLUDED.top_orgao_valor,
    top_fornecedor_nome = EXCLUDED.top_fornecedor_nome,
    top_fornecedor_valor = EXCLUDED.top_fornecedor_valor,
    top_modalidade = EXCLUDED.top_modalidade,
    top_modalidade_share = EXCLUDED.top_modalidade_share,
    maior_contrato_valor = EXCLUDED.maior_contrato_valor,
    maior_contrato_objeto = EXCLUDED.maior_contrato_objeto,
    ticket_medio = EXCLUDED.ticket_medio,
    orgaos_unicos = EXCLUDED.orgaos_unicos,
    fornecedores_unicos = EXCLUDED.fornecedores_unicos,
    segmentos_detalhe = EXCLUDED.segmentos_detalhe,
    valor_total_brl_anterior = EXCLUDED.valor_total_brl_anterior
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;
