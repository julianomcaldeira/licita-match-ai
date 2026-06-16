
CREATE INDEX IF NOT EXISTS idx_contratos_fornecedor_cnpj_digits
  ON public.contratos ((regexp_replace(COALESCE(fornecedor_cnpj,''), '\D','','g')))
  WHERE fornecedor_cnpj IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lic_venc_cnpj_digits
  ON public.licitacao_vencedores ((regexp_replace(COALESCE(cnpj,''), '\D','','g')))
  WHERE cnpj IS NOT NULL;
