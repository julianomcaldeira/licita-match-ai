CREATE INDEX IF NOT EXISTS idx_pncp_raw_contrato_compra
  ON public.pncp_raw ((payload->>'numeroControlePncpCompra'))
  WHERE tipo = 'contrato';

CREATE OR REPLACE FUNCTION public.materialize_gaps_from_contratos(p_limit integer DEFAULT 500)
RETURNS TABLE(scanned integer, materialized integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '60s'
AS $function$
DECLARE
  v_scanned integer := 0;
  v_mat integer := 0;
BEGIN
  CREATE TEMP TABLE _mat_gaps ON COMMIT DROP AS
  WITH picked AS (
    SELECT q.cnpj, q.ano, q.seq
    FROM public.pncp_gap_queue q
    WHERE q.status IN ('pending', 'failed')
    ORDER BY q.ano DESC, q.attempts, q.cnpj, q.seq
    LIMIT GREATEST(1, LEAST(p_limit, 5000))
  )
  SELECT p.cnpj, p.ano, p.seq, r.payload
  FROM picked p
  JOIN LATERAL (
    SELECT r.payload
    FROM public.pncp_raw r
    WHERE r.tipo = 'contrato'
      AND r.payload->>'numeroControlePncpCompra'
          = p.cnpj || '-1-' || lpad(p.seq::text, 6, '0') || '/' || p.ano
    ORDER BY r.coletado_em DESC
    LIMIT 1
  ) r ON true;

  GET DIAGNOSTICS v_scanned = ROW_COUNT;

  INSERT INTO public.licitacoes (
    id_origem, fonte, orgao, modalidade, objeto,
    data_publicacao, valor_estimado, valor_homologado, situacao,
    numero_controle_pncp, uf, municipio, raw_json
  )
  SELECT DISTINCT ON (g.payload->>'numeroControlePncpCompra')
    g.payload->>'numeroControlePncpCompra',
    'PNCP',
    coalesce(g.payload->'orgaoEntidade'->>'razaoSocial', 'Não informado'),
    NULL,
    coalesce(nullif(g.payload->>'objetoContrato', ''), 'Sem descrição'),
    nullif(left(g.payload->>'dataPublicacaoPncp', 10), '')::date,
    NULL,
    NULL,
    NULL,
    g.payload->>'numeroControlePncpCompra',
    g.payload->'unidadeOrgao'->>'ufSigla',
    g.payload->'unidadeOrgao'->>'municipioNome',
    jsonb_build_object(
      '_materializado_de', 'contrato',
      '_materializado_em', now(),
      'contrato', g.payload
    )
  FROM _mat_gaps g
  ON CONFLICT (numero_controle_pncp) DO NOTHING;

  GET DIAGNOSTICS v_mat = ROW_COUNT;

  DELETE FROM public.pncp_gap_queue q
  USING _mat_gaps g
  WHERE q.cnpj = g.cnpj AND q.ano = g.ano AND q.seq = g.seq;

  RETURN QUERY SELECT v_scanned, v_mat;
END;
$function$;

REVOKE ALL ON FUNCTION public.materialize_gaps_from_contratos(integer) FROM PUBLIC, anon, authenticated;