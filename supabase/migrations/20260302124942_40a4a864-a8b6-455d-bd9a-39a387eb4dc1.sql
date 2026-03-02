
-- Function to link contratos to licitacoes by matching CNPJ do orgao
CREATE OR REPLACE FUNCTION public.link_contratos_licitacoes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked_count INTEGER := 0;
BEGIN
  UPDATE contratos c
  SET licitacao_id = l.id
  FROM licitacoes l
  WHERE c.licitacao_id IS NULL
    AND c.fornecedor_cnpj IS NOT NULL
    AND l.numero_controle_pncp IS NOT NULL
    AND (
      -- Match by orgao CNPJ in raw_json
      (l.raw_json->>'orgaoEntidade'->>'cnpj') IS NOT NULL
      AND replace(replace(replace((l.raw_json->'orgaoEntidade'->>'cnpj'), '.', ''), '-', ''), '/', '') = c.cnpj_orgao
    )
    AND c.numero_licitacao IS NOT NULL
    AND c.numero_licitacao != ''
    AND l.objeto ILIKE '%' || left(c.objeto, 50) || '%';

  GET DIAGNOSTICS linked_count = ROW_COUNT;
  RETURN linked_count;
END;
$$;
