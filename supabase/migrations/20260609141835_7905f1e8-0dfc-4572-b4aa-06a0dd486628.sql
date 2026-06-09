
ALTER TABLE public.indice_startgi_mensal
  ADD COLUMN IF NOT EXISTS segmentos_detalhe jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS valor_total_brl_anterior numeric;

ALTER TABLE public.indice_startgi_historico
  ADD COLUMN IF NOT EXISTS segmentos_detalhe jsonb,
  ADD COLUMN IF NOT EXISTS valor_total_brl_anterior numeric;

CREATE OR REPLACE FUNCTION public.compute_indice_startgi(p_mes text, p_force boolean DEFAULT false)
 RETURNS indice_startgi_mensal
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '60s'
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

  SELECT COALESCE(SUM(COALESCE(valor_inicial, 0)), 0), COUNT(*)
    INTO v_valor, v_volume
  FROM public.contratos
  WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= v_mes_start
    AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  v_mes_end;

  SELECT COALESCE(SUM(COALESCE(valor_inicial, 0)), 0)
    INTO v_valor_ant
  FROM public.contratos
  WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= v_prev_start
    AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  v_mes_start;

  SELECT valor_total_brl INTO v_base FROM public.indice_startgi_mensal WHERE mes_referencia = '2024-01';
  IF v_base IS NULL THEN
    IF p_mes = '2024-01' THEN
      v_base := v_valor;
    ELSE
      SELECT COALESCE(SUM(COALESCE(valor_inicial, 0)), 0) INTO v_base
      FROM public.contratos
      WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= date '2024-01-01'
        AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  date '2024-02-01';
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
    WITH src AS (
      SELECT
        CASE
          WHEN modalidade_compra ILIKE '%preg%'     THEN 'Pregão'
          WHEN modalidade_compra ILIKE '%dispensa%' THEN 'Dispensa'
          WHEN modalidade_compra ILIKE '%concor%'   THEN 'Concorrência'
          WHEN modalidade_compra ILIKE '%inexigib%' THEN 'Inexigibilidade'
          ELSE 'Outros'
        END AS bucket,
        COALESCE(valor_inicial, 0) AS v
      FROM public.contratos
      WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= v_mes_start
        AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  v_mes_end
    ),
    agg AS (SELECT bucket, SUM(v) AS sv FROM src GROUP BY bucket)
    SELECT COALESCE(jsonb_object_agg(bucket, ROUND((sv / v_valor) * 100, 1)), '{}'::jsonb)
      INTO v_mod FROM agg;

    SELECT bucket, ROUND((sv / v_valor) * 100, 1)
      INTO v_top_mod, v_top_mod_share
    FROM (
      SELECT
        CASE
          WHEN modalidade_compra ILIKE '%preg%'     THEN 'Pregão'
          WHEN modalidade_compra ILIKE '%dispensa%' THEN 'Dispensa'
          WHEN modalidade_compra ILIKE '%concor%'   THEN 'Concorrência'
          WHEN modalidade_compra ILIKE '%inexigib%' THEN 'Inexigibilidade'
          ELSE 'Outros'
        END AS bucket,
        SUM(COALESCE(valor_inicial, 0)) AS sv
      FROM public.contratos
      WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= v_mes_start
        AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  v_mes_end
      GROUP BY 1
      ORDER BY sv DESC NULLS LAST
      LIMIT 1
    ) t;

    WITH src AS (
      SELECT
        CASE
          WHEN orgao_nome ILIKE 'munic%' OR orgao_nome ILIKE 'prefeitura%' OR orgao_nome ILIKE '%câmara munic%' OR orgao_nome ILIKE '%camara munic%' THEN 'municipal'
          WHEN orgao_nome ILIKE 'governo do estado%' OR orgao_nome ILIKE 'secretaria de estado%' OR orgao_nome ILIKE 'assembleia legislativa%' OR orgao_nome ILIKE '%governo do distrito federal%' THEN 'estadual'
          WHEN orgao_nome ILIKE 'ministério%' OR orgao_nome ILIKE 'ministerio%' OR orgao_nome ILIKE '%união%' OR orgao_nome ILIKE '%uniao%' OR orgao_nome ILIKE 'federal%' OR orgao_nome ILIKE 'tribunal regional federal%' OR orgao_nome ILIKE 'justiça federal%' OR orgao_nome ILIKE 'policia federal%' OR orgao_nome ILIKE 'polícia federal%' THEN 'federal'
          ELSE 'outros'
        END AS bucket,
        COALESCE(valor_inicial, 0) AS v
      FROM public.contratos
      WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= v_mes_start
        AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  v_mes_end
    ),
    agg AS (SELECT bucket, SUM(v) AS sv FROM src GROUP BY bucket)
    SELECT COALESCE(jsonb_object_agg(bucket, ROUND((sv / v_valor) * 100, 1)), '{}'::jsonb)
      INTO v_esf FROM agg;

    -- Segmento: detalhe com valor mes atual, valor mes anterior, variacao e share
    WITH cur AS (
      SELECT
        CASE
          WHEN objeto ILIKE '%saúde%' OR objeto ILIKE '%saude%' OR objeto ILIKE '%hospital%' OR objeto ILIKE '%medicament%' OR objeto ILIKE '%clínic%' OR objeto ILIKE '%clinic%' THEN 'Saúde'
          WHEN objeto ILIKE '%software%' OR objeto ILIKE '%tecnolog%' OR objeto ILIKE '%sistema%' OR objeto ILIKE '%telecom%' OR objeto ILIKE '%computador%' OR objeto ILIKE '%TI %' THEN 'TI e Telecom'
          WHEN objeto ILIKE '%obra%' OR objeto ILIKE '%construç%' OR objeto ILIKE '%pavimenta%' OR objeto ILIKE '%reforma%' OR objeto ILIKE '%infraestrut%' THEN 'Obras'
          WHEN objeto ILIKE '%ensino%' OR objeto ILIKE '%educa%' OR objeto ILIKE '%escola%' OR objeto ILIKE '%merenda%' THEN 'Educação'
          WHEN objeto ILIKE '%limpeza%' OR objeto ILIKE '%vigilânc%' OR objeto ILIKE '%vigilanc%' OR objeto ILIKE '%manutenç%' OR objeto ILIKE '%transporte%' THEN 'Serviços Gerais'
          ELSE 'Outros'
        END AS bucket,
        SUM(COALESCE(valor_inicial, 0)) AS v
      FROM public.contratos
      WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= v_mes_start
        AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  v_mes_end
      GROUP BY 1
    ),
    prev AS (
      SELECT
        CASE
          WHEN objeto ILIKE '%saúde%' OR objeto ILIKE '%saude%' OR objeto ILIKE '%hospital%' OR objeto ILIKE '%medicament%' OR objeto ILIKE '%clínic%' OR objeto ILIKE '%clinic%' THEN 'Saúde'
          WHEN objeto ILIKE '%software%' OR objeto ILIKE '%tecnolog%' OR objeto ILIKE '%sistema%' OR objeto ILIKE '%telecom%' OR objeto ILIKE '%computador%' OR objeto ILIKE '%TI %' THEN 'TI e Telecom'
          WHEN objeto ILIKE '%obra%' OR objeto ILIKE '%construç%' OR objeto ILIKE '%pavimenta%' OR objeto ILIKE '%reforma%' OR objeto ILIKE '%infraestrut%' THEN 'Obras'
          WHEN objeto ILIKE '%ensino%' OR objeto ILIKE '%educa%' OR objeto ILIKE '%escola%' OR objeto ILIKE '%merenda%' THEN 'Educação'
          WHEN objeto ILIKE '%limpeza%' OR objeto ILIKE '%vigilânc%' OR objeto ILIKE '%vigilanc%' OR objeto ILIKE '%manutenç%' OR objeto ILIKE '%transporte%' THEN 'Serviços Gerais'
          ELSE 'Outros'
        END AS bucket,
        SUM(COALESCE(valor_inicial, 0)) AS v
      FROM public.contratos
      WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= v_prev_start
        AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  v_mes_start
      GROUP BY 1
    ),
    joined AS (
      SELECT c.bucket,
             c.v AS valor_atual,
             COALESCE(p.v, 0) AS valor_anterior,
             CASE WHEN COALESCE(p.v,0) > 0 THEN ROUND(((c.v - p.v) / p.v) * 100, 1) END AS var_pct,
             ROUND((c.v / v_valor) * 100, 1) AS share_pct
      FROM cur c LEFT JOIN prev p USING (bucket)
    )
    SELECT COALESCE(jsonb_object_agg(bucket, share_pct), '{}'::jsonb) INTO v_seg FROM joined;

    WITH cur AS (
      SELECT
        CASE
          WHEN objeto ILIKE '%saúde%' OR objeto ILIKE '%saude%' OR objeto ILIKE '%hospital%' OR objeto ILIKE '%medicament%' OR objeto ILIKE '%clínic%' OR objeto ILIKE '%clinic%' THEN 'Saúde'
          WHEN objeto ILIKE '%software%' OR objeto ILIKE '%tecnolog%' OR objeto ILIKE '%sistema%' OR objeto ILIKE '%telecom%' OR objeto ILIKE '%computador%' OR objeto ILIKE '%TI %' THEN 'TI e Telecom'
          WHEN objeto ILIKE '%obra%' OR objeto ILIKE '%construç%' OR objeto ILIKE '%pavimenta%' OR objeto ILIKE '%reforma%' OR objeto ILIKE '%infraestrut%' THEN 'Obras'
          WHEN objeto ILIKE '%ensino%' OR objeto ILIKE '%educa%' OR objeto ILIKE '%escola%' OR objeto ILIKE '%merenda%' THEN 'Educação'
          WHEN objeto ILIKE '%limpeza%' OR objeto ILIKE '%vigilânc%' OR objeto ILIKE '%vigilanc%' OR objeto ILIKE '%manutenç%' OR objeto ILIKE '%transporte%' THEN 'Serviços Gerais'
          ELSE 'Outros'
        END AS bucket,
        SUM(COALESCE(valor_inicial, 0)) AS v
      FROM public.contratos
      WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= v_mes_start
        AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  v_mes_end
      GROUP BY 1
    ),
    prev AS (
      SELECT
        CASE
          WHEN objeto ILIKE '%saúde%' OR objeto ILIKE '%saude%' OR objeto ILIKE '%hospital%' OR objeto ILIKE '%medicament%' OR objeto ILIKE '%clínic%' OR objeto ILIKE '%clinic%' THEN 'Saúde'
          WHEN objeto ILIKE '%software%' OR objeto ILIKE '%tecnolog%' OR objeto ILIKE '%sistema%' OR objeto ILIKE '%telecom%' OR objeto ILIKE '%computador%' OR objeto ILIKE '%TI %' THEN 'TI e Telecom'
          WHEN objeto ILIKE '%obra%' OR objeto ILIKE '%construç%' OR objeto ILIKE '%pavimenta%' OR objeto ILIKE '%reforma%' OR objeto ILIKE '%infraestrut%' THEN 'Obras'
          WHEN objeto ILIKE '%ensino%' OR objeto ILIKE '%educa%' OR objeto ILIKE '%escola%' OR objeto ILIKE '%merenda%' THEN 'Educação'
          WHEN objeto ILIKE '%limpeza%' OR objeto ILIKE '%vigilânc%' OR objeto ILIKE '%vigilanc%' OR objeto ILIKE '%manutenç%' OR objeto ILIKE '%transporte%' THEN 'Serviços Gerais'
          ELSE 'Outros'
        END AS bucket,
        SUM(COALESCE(valor_inicial, 0)) AS v
      FROM public.contratos
      WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= v_prev_start
        AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  v_mes_start
      GROUP BY 1
    ),
    joined AS (
      SELECT c.bucket AS nome,
             c.v AS valor_atual,
             COALESCE(p.v, 0) AS valor_anterior,
             CASE WHEN COALESCE(p.v,0) > 0 THEN ROUND(((c.v - p.v) / p.v) * 100, 1) END AS var_pct,
             ROUND((c.v / v_valor) * 100, 1) AS share_pct
      FROM cur c LEFT JOIN prev p USING (bucket)
      ORDER BY c.v DESC
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(joined)), '[]'::jsonb) INTO v_seg_det FROM joined;

    SELECT nome, var_pct
      INTO v_destaque, v_destaque_var
    FROM jsonb_to_recordset(v_seg_det) AS x(nome text, valor_atual numeric, valor_anterior numeric, var_pct numeric, share_pct numeric)
    WHERE var_pct IS NOT NULL
    ORDER BY var_pct DESC NULLS LAST
    LIMIT 1;

    SELECT orgao_nome, SUM(COALESCE(valor_inicial,0))
      INTO v_top_orgao, v_top_orgao_v
    FROM public.contratos
    WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= v_mes_start
      AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  v_mes_end
      AND orgao_nome IS NOT NULL
    GROUP BY orgao_nome
    ORDER BY 2 DESC NULLS LAST
    LIMIT 1;

    SELECT fornecedor_nome, SUM(COALESCE(valor_inicial,0))
      INTO v_top_forn, v_top_forn_v
    FROM public.contratos
    WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= v_mes_start
      AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  v_mes_end
      AND fornecedor_nome IS NOT NULL
    GROUP BY fornecedor_nome
    ORDER BY 2 DESC NULLS LAST
    LIMIT 1;

    SELECT valor_inicial, objeto
      INTO v_maior_v, v_maior_obj
    FROM public.contratos
    WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= v_mes_start
      AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  v_mes_end
    ORDER BY valor_inicial DESC NULLS LAST
    LIMIT 1;

    v_ticket := CASE WHEN v_volume > 0 THEN ROUND(v_valor / v_volume, 2) END;

    SELECT COUNT(DISTINCT orgao_nome), COUNT(DISTINCT fornecedor_nome)
      INTO v_orgaos, v_fornec
    FROM public.contratos
    WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= v_mes_start
      AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  v_mes_end;
  END IF;

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

-- Atualiza trigger de histórico para incluir novos campos
CREATE OR REPLACE FUNCTION public.indice_startgi_log_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.indice_startgi_historico (
    mes_referencia, indice_startgi, valor_total_brl, volume_contratos,
    variacao_mom, variacao_yoy, breakdown_modalidade, breakdown_esfera, breakdown_segmento,
    destaque_segmento, destaque_variacao, dados_parciais,
    top_orgao_nome, top_orgao_valor, top_fornecedor_nome, top_fornecedor_valor,
    top_modalidade, top_modalidade_share, maior_contrato_valor, maior_contrato_objeto,
    ticket_medio, orgaos_unicos, fornecedores_unicos,
    segmentos_detalhe, valor_total_brl_anterior,
    gerado_em
  ) VALUES (
    NEW.mes_referencia, NEW.indice_startgi, NEW.valor_total_brl, NEW.volume_contratos,
    NEW.variacao_mom, NEW.variacao_yoy, NEW.breakdown_modalidade, NEW.breakdown_esfera, NEW.breakdown_segmento,
    NEW.destaque_segmento, NEW.destaque_variacao, NEW.dados_parciais,
    NEW.top_orgao_nome, NEW.top_orgao_valor, NEW.top_fornecedor_nome, NEW.top_fornecedor_valor,
    NEW.top_modalidade, NEW.top_modalidade_share, NEW.maior_contrato_valor, NEW.maior_contrato_objeto,
    NEW.ticket_medio, NEW.orgaos_unicos, NEW.fornecedores_unicos,
    NEW.segmentos_detalhe, NEW.valor_total_brl_anterior,
    NEW.ultima_atualizacao
  );
  RETURN NEW;
END;
$$;
