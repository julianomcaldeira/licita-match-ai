
CREATE UNIQUE INDEX IF NOT EXISTS uq_licitacoes_numero_controle_pncp
  ON public.licitacoes (numero_controle_pncp)
  WHERE numero_controle_pncp IS NOT NULL;
