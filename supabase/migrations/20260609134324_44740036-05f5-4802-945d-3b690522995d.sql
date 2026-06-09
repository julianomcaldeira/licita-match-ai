
CREATE OR REPLACE FUNCTION public.compute_indice_startgi(p_mes text, p_force boolean DEFAULT false)
RETURNS public.indice_startgi_mensal
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
SET statement_timeout TO '60s'
AS $$
DECLARE
  v_mes_start date;
  v_mes_end date;
  v_now timestamptz := now();
  v_deadline date;
  v_parciais boolean;
  v_existing public.indice_startgi_mensal;
  v_valor numeric := 0;
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
  v_destaque text;
  v_destaque_var numeric;
  v_row public.indice_startgi_mensal;
BEGIN
  IF p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'p_mes deve estar no formato YYYY-MM';
  END IF;

  v_mes_start := to_date(p_mes || '-01', 'YYYY-MM-DD');
  v_mes_end := (v_mes_start + interval '1 month')::date;
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
    -- Modalidade
    WITH src AS (
      SELECT
        CASE
          WHEN modalidade_compra ILIKE '%preg%'     THEN 'pregao'
          WHEN modalidade_compra ILIKE '%dispensa%' THEN 'dispensa'
          WHEN modalidade_compra ILIKE '%concor%'   THEN 'concorrencia'
          WHEN modalidade_compra ILIKE '%inexigib%' THEN 'inexigibilidade'
          ELSE 'outros'
        END AS bucket,
        COALESCE(valor_inicial, 0) AS v
      FROM public.contratos
      WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= v_mes_start
        AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  v_mes_end
    ),
    agg AS (SELECT bucket, SUM(v) AS sv FROM src GROUP BY bucket)
    SELECT COALESCE(jsonb_object_agg(bucket, ROUND((sv / v_valor) * 100, 1)), '{}'::jsonb)
      INTO v_mod FROM agg;

    -- Esfera
    WITH src AS (
      SELECT
        CASE
          WHEN orgao_nome ILIKE 'munic%' OR orgao_nome ILIKE 'prefeitura%' OR orgao_nome ILIKE '%câmara munic%' OR orgao_nome ILIKE '%camara munic%' THEN 'municipal'
          WHEN orgao_nome ILIKE 'governo do estado%' OR orgao_nome ILIKE 'secretaria de estado%' OR orgao_nome ILIKE 'assembleia legislativa%' OR orgao_nome ILIKE '%governo do distrito federal%' THEN 'estadual'
          WHEN orgao_nome ILIKE 'minist%' OR orgao_nome ILIKE 'uni%o federal%' OR orgao_nome ILIKE 'presid%ncia%' OR orgao_nome ILIKE 'congresso%' OR orgao_nome ILIKE 'supremo%' OR orgao_nome ILIKE 'tribunal superior%' THEN 'federal'
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

    -- Segmento
    WITH src AS (
      SELECT
        CASE
          WHEN objeto ILIKE '%tecnolog%' OR objeto ILIKE '%software%' OR objeto ILIKE '%telecom%' OR objeto ILIKE '%inform%tic%' THEN 'TI e Telecom'
          WHEN objeto ILIKE '%sa%de%' OR objeto ILIKE '%hospital%' OR objeto ILIKE '%medic%' OR objeto ILIKE '%farm%' THEN 'Saúde'
          WHEN objeto ILIKE '%obra%' OR objeto ILIKE '%constru%' OR objeto ILIKE '%pavimenta%' OR objeto ILIKE '%engenharia%' THEN 'Obras'
          WHEN objeto ILIKE '%educa%' OR objeto ILIKE '%escola%' OR objeto ILIKE '%merenda%' OR objeto ILIKE '%did%tic%' THEN 'Educação'
          WHEN objeto ILIKE '%alimenta%' OR objeto ILIKE '%g%nero%aliment%' THEN 'Alimentação'
          WHEN objeto ILIKE '%transporte%' OR objeto ILIKE '%ve%culo%' OR objeto ILIKE '%combust%' THEN 'Transporte'
          WHEN objeto ILIKE '%limpeza%' OR objeto ILIKE '%vigil%ncia%' OR objeto ILIKE '%seguran%a%' THEN 'Serviços Gerais'
          ELSE 'Outros'
        END AS bucket,
        COALESCE(valor_inicial, 0) AS v
      FROM public.contratos
      WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= v_mes_start
        AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  v_mes_end
    ),
    agg AS (SELECT bucket, SUM(v) AS sv FROM src GROUP BY bucket)
    SELECT COALESCE(jsonb_object_agg(bucket, ROUND((sv / v_valor) * 100, 1)), '{}'::jsonb)
      INTO v_seg FROM agg;

    -- Destaque: maior variação MoM por segmento
    WITH cur AS (
      SELECT
        CASE
          WHEN objeto ILIKE '%tecnolog%' OR objeto ILIKE '%software%' OR objeto ILIKE '%telecom%' OR objeto ILIKE '%inform%tic%' THEN 'TI e Telecom'
          WHEN objeto ILIKE '%sa%de%' OR objeto ILIKE '%hospital%' OR objeto ILIKE '%medic%' OR objeto ILIKE '%farm%' THEN 'Saúde'
          WHEN objeto ILIKE '%obra%' OR objeto ILIKE '%constru%' OR objeto ILIKE '%pavimenta%' OR objeto ILIKE '%engenharia%' THEN 'Obras'
          WHEN objeto ILIKE '%educa%' OR objeto ILIKE '%escola%' OR objeto ILIKE '%merenda%' OR objeto ILIKE '%did%tic%' THEN 'Educação'
          WHEN objeto ILIKE '%alimenta%' OR objeto ILIKE '%g%nero%aliment%' THEN 'Alimentação'
          WHEN objeto ILIKE '%transporte%' OR objeto ILIKE '%ve%culo%' OR objeto ILIKE '%combust%' THEN 'Transporte'
          WHEN objeto ILIKE '%limpeza%' OR objeto ILIKE '%vigil%ncia%' OR objeto ILIKE '%seguran%a%' THEN 'Serviços Gerais'
          ELSE 'Outros'
        END AS bucket,
        SUM(COALESCE(valor_inicial,0)) AS v
      FROM public.contratos
      WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= v_mes_start
        AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  v_mes_end
      GROUP BY 1
    ),
    prev AS (
      SELECT
        CASE
          WHEN objeto ILIKE '%tecnolog%' OR objeto ILIKE '%software%' OR objeto ILIKE '%telecom%' OR objeto ILIKE '%inform%tic%' THEN 'TI e Telecom'
          WHEN objeto ILIKE '%sa%de%' OR objeto ILIKE '%hospital%' OR objeto ILIKE '%medic%' OR objeto ILIKE '%farm%' THEN 'Saúde'
          WHEN objeto ILIKE '%obra%' OR objeto ILIKE '%constru%' OR objeto ILIKE '%pavimenta%' OR objeto ILIKE '%engenharia%' THEN 'Obras'
          WHEN objeto ILIKE '%educa%' OR objeto ILIKE '%escola%' OR objeto ILIKE '%merenda%' OR objeto ILIKE '%did%tic%' THEN 'Educação'
          WHEN objeto ILIKE '%alimenta%' OR objeto ILIKE '%g%nero%aliment%' THEN 'Alimentação'
          WHEN objeto ILIKE '%transporte%' OR objeto ILIKE '%ve%culo%' OR objeto ILIKE '%combust%' THEN 'Transporte'
          WHEN objeto ILIKE '%limpeza%' OR objeto ILIKE '%vigil%ncia%' OR objeto ILIKE '%seguran%a%' THEN 'Serviços Gerais'
          ELSE 'Outros'
        END AS bucket,
        SUM(COALESCE(valor_inicial,0)) AS v
      FROM public.contratos
      WHERE COALESCE(data_assinatura, data_publicacao, created_at::date) >= (v_mes_start - interval '1 month')::date
        AND COALESCE(data_assinatura, data_publicacao, created_at::date) <  v_mes_start
      GROUP BY 1
    ),
    j AS (
      SELECT c.bucket,
             CASE WHEN COALESCE(p.v,0) > 0
                  THEN ROUND(((c.v - p.v) / p.v) * 100, 1)
                  ELSE NULL END AS var
      FROM cur c LEFT JOIN prev p USING (bucket)
    )
    SELECT bucket, var INTO v_destaque, v_destaque_var
    FROM j WHERE var IS NOT NULL
    ORDER BY var DESC NULLS LAST
    LIMIT 1;
  END IF;

  INSERT INTO public.indice_startgi_mensal AS t (
    mes_referencia, indice_startgi, valor_total_brl, volume_contratos,
    variacao_mom, variacao_yoy,
    breakdown_modalidade, breakdown_esfera, breakdown_segmento,
    destaque_segmento, destaque_variacao, dados_parciais, ultima_atualizacao
  ) VALUES (
    p_mes, v_indice, v_valor, v_volume,
    v_var_mom, v_var_yoy,
    COALESCE(v_mod,'{}'::jsonb), COALESCE(v_esf,'{}'::jsonb), COALESCE(v_seg,'{}'::jsonb),
    v_destaque, v_destaque_var, v_parciais, v_now
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
    ultima_atualizacao = EXCLUDED.ultima_atualizacao
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
