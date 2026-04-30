
DROP INDEX IF EXISTS public.uq_licitacoes_numero_controle_pncp;

-- Limpa eventuais nulos duplicados (impossível por design, mas garantia)
ALTER TABLE public.licitacoes
  ADD CONSTRAINT licitacoes_numero_controle_pncp_key UNIQUE (numero_controle_pncp);
