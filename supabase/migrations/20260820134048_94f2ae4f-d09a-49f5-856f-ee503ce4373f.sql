CREATE INDEX IF NOT EXISTS idx_contratos_compra_pncp
  ON public.contratos ((raw_json->>'numeroControlePncpCompra'));

CREATE OR REPLACE FUNCTION public.materialize_gaps_from_contratos(p_limit integer DEFAULT 500)
RETURNS TABLE(scanned integer, materialized integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '55s'
AS $function$
DECLARE
  v_scanned integer := 0;
  v_mat integer := 0;
BEGIN
  CREATE TEMP TABLE _mat_gaps ON COMMIT DROP AS
  WITH picked AS (
    SELECT q.cnpj, q.ano, q.seq
    FROM public.pncp_gap_queue q
    WHERE q.status = 'pending'
    ORDER BY q.ano DESC, q.cnpj, q.seq
    LIMIT GREATEST(1, LEAST(p_limit, 20000))
  )
  SELECT p.cnpj, p.ano, p.seq, c.chave, c.orgao_nome, c.objeto,
         c.data_publicacao, c.raw_json
  FROM picked p
  JOIN LATERAL (
    SELECT c.raw_json->>'numeroControlePncpCompra' AS chave,
           c.orgao_nome, c.objeto, c.data_publicacao, c.raw_json
    FROM public.contratos c
    WHERE c.raw_json->>'numeroControlePncpCompra'
        = p.cnpj || '-1-' || lpad(p.seq::text, 6, '0') || '/' || p.ano
    ORDER BY c.data_publicacao DESC NULLS LAST
    LIMIT 1
  ) c ON true;

  GET DIAGNOSTICS v_scanned = ROW_COUNT;

  INSERT INTO public.licitacoes (
    id_origem, fonte, orgao, modalidade, objeto,
    data_publicacao, valor_estimado, valor_homologado, situacao,
    numero_controle_pncp, uf, municipio, raw_json
  )
  SELECT DISTINCT ON (g.chave)
    g.chave,
    'PNCP',
    coalesce(nullif(g.orgao_nome, ''), g.raw_json->'orgaoEntidade'->>'razaoSocial', 'Não informado'),
    NULL,
    coalesce(nullif(g.objeto, ''), nullif(g.raw_json->>'objetoContrato', ''), 'Sem descrição'),
    g.data_publicacao,
    NULL,
    NULL,
    NULL,
    g.chave,
    g.raw_json->'unidadeOrgao'->>'ufSigla',
    g.raw_json->'unidadeOrgao'->>'municipioNome',
    jsonb_build_object(
      '_materializado_de', 'contrato',
      '_materializado_em', now(),
      'contrato', g.raw_json
    )
  FROM _mat_gaps g
  WHERE g.chave IS NOT NULL
  ON CONFLICT (numero_controle_pncp) DO NOTHING;

  GET DIAGNOSTICS v_mat = ROW_COUNT;

  DELETE FROM public.pncp_gap_queue q
  USING _mat_gaps g
  WHERE q.cnpj = g.cnpj AND q.ano = g.ano AND q.seq = g.seq;

  RETURN QUERY SELECT v_scanned, v_mat;
END;
$function$;

REVOKE ALL ON FUNCTION public.materialize_gaps_from_contratos(integer) FROM PUBLIC, anon, authenticated;