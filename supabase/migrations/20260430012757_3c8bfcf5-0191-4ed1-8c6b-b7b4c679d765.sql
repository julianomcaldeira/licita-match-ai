CREATE OR REPLACE FUNCTION public.run_ingestion_audit()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_id UUID;
  v_start TIMESTAMP WITH TIME ZONE := clock_timestamp();
  v_total_lic BIGINT;
  v_total_homol BIGINT;
  v_com_itens BIGINT;
  v_com_venc BIGINT;
  v_homol_sem_itens BIGINT;
  v_homol_sem_venc BIGINT;
  v_itens_sem_venc BIGINT;
  v_total_contratos BIGINT;
  v_contratos_orfaos BIGINT;
  v_total_venc BIGINT;
  v_pct_homol NUMERIC(5,2);
  v_pct_venc NUMERIC(5,2);
  v_inconsist JSONB := '[]'::jsonb;
  v_severity TEXT := 'ok';
BEGIN
  SELECT COUNT(*) INTO v_total_lic FROM licitacoes;
  SELECT COUNT(*) INTO v_total_homol FROM licitacoes WHERE COALESCE(valor_homologado, 0) > 0;
  SELECT COUNT(DISTINCT licitacao_id) INTO v_com_itens FROM licitacao_itens;

  SELECT COUNT(DISTINCT li.licitacao_id) INTO v_com_venc
  FROM licitacao_itens li
  JOIN licitacao_vencedores lv ON lv.item_id = li.id;

  SELECT COUNT(*) INTO v_homol_sem_itens
  FROM licitacoes l
  WHERE COALESCE(l.valor_homologado, 0) > 0
    AND NOT EXISTS (SELECT 1 FROM licitacao_itens li WHERE li.licitacao_id = l.id);

  SELECT COUNT(*) INTO v_homol_sem_venc
  FROM licitacoes l
  WHERE COALESCE(l.valor_homologado, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM licitacao_itens li
      JOIN licitacao_vencedores lv ON lv.item_id = li.id
      WHERE li.licitacao_id = l.id
    );

  SELECT COUNT(*) INTO v_itens_sem_venc
  FROM licitacao_itens li
  WHERE NOT EXISTS (SELECT 1 FROM licitacao_vencedores lv WHERE lv.item_id = li.id);

  SELECT COUNT(*) INTO v_total_contratos FROM contratos;
  SELECT COUNT(*) INTO v_contratos_orfaos FROM contratos WHERE licitacao_id IS NULL;
  SELECT COUNT(*) INTO v_total_venc FROM licitacao_vencedores;

  v_pct_homol := CASE WHEN v_total_homol > 0
    THEN ROUND(((v_total_homol - v_homol_sem_itens)::NUMERIC / v_total_homol) * 100, 2)
    ELSE 100 END;
  v_pct_venc := CASE WHEN v_total_homol > 0
    THEN ROUND(((v_total_homol - v_homol_sem_venc)::NUMERIC / v_total_homol) * 100, 2)
    ELSE 100 END;

  IF v_homol_sem_itens > 0 THEN
    v_inconsist := v_inconsist || jsonb_build_object(
      'tipo', 'homologadas_sem_itens',
      'fonte', 'PNCP',
      'count', v_homol_sem_itens,
      'mensagem', format('%s licitações homologadas não possuem itens cadastrados', v_homol_sem_itens)
    );
  END IF;

  IF v_homol_sem_venc > 0 THEN
    v_inconsist := v_inconsist || jsonb_build_object(
      'tipo', 'homologadas_sem_vencedores',
      'fonte', 'PNCP',
      'count', v_homol_sem_venc,
      'mensagem', format('%s licitações homologadas não possuem vencedores', v_homol_sem_venc)
    );
  END IF;

  IF v_itens_sem_venc > 0 THEN
    v_inconsist := v_inconsist || jsonb_build_object(
      'tipo', 'itens_sem_vencedores',
      'fonte', 'PNCP',
      'count', v_itens_sem_venc,
      'mensagem', format('%s itens de licitação sem vencedor associado', v_itens_sem_venc)
    );
  END IF;

  IF v_contratos_orfaos > 0 THEN
    v_inconsist := v_inconsist || jsonb_build_object(
      'tipo', 'contratos_sem_licitacao',
      'fonte', 'PORTAL_TRANSPARENCIA',
      'count', v_contratos_orfaos,
      'mensagem', format('%s contratos sem vínculo a licitação', v_contratos_orfaos)
    );
  END IF;

  IF v_pct_venc < 70 OR v_homol_sem_venc > 5000 THEN
    v_severity := 'critical';
  ELSIF v_pct_venc < 90 OR v_homol_sem_venc > 1000 THEN
    v_severity := 'warning';
  ELSIF v_homol_sem_itens > 0 OR v_homol_sem_venc > 0 THEN
    v_severity := 'minor';
  END IF;

  INSERT INTO auditoria_ingestao (
    total_licitacoes, total_homologadas, total_com_itens, total_com_vencedores,
    homologadas_sem_itens, homologadas_sem_vencedores, itens_sem_vencedores,
    total_contratos, contratos_sem_licitacao, total_vencedores,
    pct_cobertura_homologadas, pct_cobertura_vencedores,
    inconsistencias, severity, duration_ms
  ) VALUES (
    v_total_lic, v_total_homol, v_com_itens, v_com_venc,
    v_homol_sem_itens, v_homol_sem_venc, v_itens_sem_venc,
    v_total_contratos, v_contratos_orfaos, v_total_venc,
    v_pct_homol, v_pct_venc,
    v_inconsist, v_severity,
    EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start)::INTEGER
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;