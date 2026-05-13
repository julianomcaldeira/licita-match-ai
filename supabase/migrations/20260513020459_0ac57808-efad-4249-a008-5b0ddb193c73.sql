CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_emp_venc_key
  ON public.mv_empresas_vencedoras (razao_social, cnpj, uf, municipio) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_orgaos_key
  ON public.mv_orgaos (orgao, uf, municipio) NULLS NOT DISTINCT;